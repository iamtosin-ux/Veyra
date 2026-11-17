import { get, now, parseJson, run } from "../db";
import { HttpError, type User } from "../auth";
import { getEvidenceForUser } from "../evidence";
import { latestIntegrity } from "../analysis/integrity";
import { CATEGORIES, REASONS, integrityStatus, type Category, type ComplianceStatus, type ReasonCode, type VerificationStatus } from "@/lib/compliance";
import { ComplianceBlockedError, audit, authorise, evidenceAudit, preview, refreshEvidenceCompliance } from "./engine";
import { activePolicy } from "./policy";
import { flagForEvidence } from "../reassessment";

// What a reviewer sees and does about one item's compliance. Compliance
// authorisation, file integrity, external verification and factual reliability
// are kept separate; none stands in for another.

export function evidenceCompliance(user: User, evidenceId: string) {
  const e = getEvidenceForUser(user, evidenceId);
  const status = refreshEvidenceCompliance(e.id);
  const fresh = get<{ category: Category; category_source: string; category_confirmed: number; declared_source: string | null; verification_status: VerificationStatus; human_approval: string | null; compliance_reasons: string }>(
    "SELECT category, category_source, category_confirmed, declared_source, verification_status, human_approval, compliance_reasons FROM evidence WHERE id = ?",
    e.id,
  )!;
  const decision = preview({ operation: "observations", provider: "anthropic", organisationId: user.organisation_id, evidenceId: e.id, user });
  const policy = activePolicy(user.organisation_id);
  const lastRun = get<{ policy_version: number | null; completed_at: string | null; model_identifier: string | null }>(
    "SELECT policy_version, completed_at, model_identifier FROM analysis_runs WHERE evidence_id = ? AND scope = 'evidence' AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
    e.id,
  );
  const report = latestIntegrity(e.id);
  return {
    evidence: {
      id: e.id,
      reference: e.reference,
      filename: e.original_filename,
      type: e.evidence_type,
      uploaded_at: e.uploaded_at,
      declared_source: fresh.declared_source,
      hash: e.file_hash,
      processing_status: e.processing_status,
    },
    compliance: {
      status,
      decision: decision.decision,
      // A restriction's own reasons (e.g. quarantined at upload) come first.
      reasons: [...(status === "RESTRICTED" ? parseJson<string[]>(fresh.compliance_reasons, []).filter((r) => r === "ACTIVE_CONTENT") : []), ...decision.reasons].map((r) => ({ code: r, text: REASONS[r as ReasonCode] ?? r })),
      explanation: decision.explanation,
      category: fresh.category,
      category_source: fresh.category_source,
      category_confirmed: !!fresh.category_confirmed,
      human_approval: parseJson<{ by: string; at: string; reason: string } | null>(fresh.human_approval ?? "null", null),
      can_approve: decision.decision === "REVIEW_REQUIRED" && user.role === "admin",
    },
    integrity: { status: integrityStatus(report?.indicators), checked_at: report?.checked_at ?? null },
    verification: { status: fresh.verification_status },
    policy: policy ? { version: policy.version, approved_at: policy.approved_at, approver: policy.approver_name } : null,
    // Results produced under an older policy version keep that reference and can be reassessed.
    analysed_under: lastRun ? { policy_version: lastRun.policy_version, at: lastRun.completed_at, model: lastRun.model_identifier } : null,
    reassess: !!(lastRun && policy && lastRun.policy_version !== null && lastRun.policy_version !== policy.version),
    history: evidenceAudit(user, e.id),
  };
}

function record(user: User, e: { id: string; case_id: string }, operation: "human_approval" | "restriction" | "classification" | "external_verification", explanation: string) {
  const policy = activePolicy(user.organisation_id);
  audit({
    organisationId: user.organisation_id,
    caseId: e.case_id,
    evidenceId: e.id,
    user,
    actor: user.name,
    operation,
    purpose: policy?.config.purpose ?? null,
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    decision: "RECORDED",
    reasons: [],
    explanation,
    provider: null,
  });
}

/** A responsible person resolves a REVIEW_REQUIRED decision. Blocks can only be lifted by changing the policy. */
export function approveForAnalysis(user: User, evidenceId: string, reason: string): ComplianceStatus {
  const e = getEvidenceForUser(user, evidenceId);
  if (user.role !== "admin") throw new HttpError(403, "Only an administrator can approve evidence for analysis");
  if (!reason.trim()) throw new HttpError(400, "Record why this evidence may be analysed");
  const d = preview({ operation: "observations", provider: "anthropic", organisationId: user.organisation_id, evidenceId: e.id, user });
  if (d.decision === "BLOCK") throw new HttpError(409, `This can't be approved here: ${d.explanation}`);
  if (d.decision === "ALLOW") return refreshEvidenceCompliance(e.id);
  run("UPDATE evidence SET human_approval = ?, category_confirmed = 1 WHERE id = ?", JSON.stringify({ by: user.name, at: now(), reason: reason.trim() }), e.id);
  record(user, e, "human_approval", `Approved for analysis: ${reason.trim()}`);
  return refreshEvidenceCompliance(e.id);
}

/** Confirm or correct what kind of evidence this is. Clears any earlier approval, which was for the old category. */
export function setCategory(user: User, evidenceId: string, category: string): ComplianceStatus {
  const e = getEvidenceForUser(user, evidenceId);
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, "Unknown evidence type");
  run("UPDATE evidence SET category = ?, category_source = 'reviewer', category_confirmed = 1, human_approval = NULL WHERE id = ?", category, e.id);
  record(user, e, "classification", `Evidence type set to ${category} by a reviewer.`);
  return refreshEvidenceCompliance(e.id);
}

/** Quarantine: nothing runs on restricted evidence until the restriction is lifted. */
export function setRestricted(user: User, evidenceId: string, restricted: boolean, reason: string): ComplianceStatus {
  const e = getEvidenceForUser(user, evidenceId);
  if (restricted) {
    run("UPDATE evidence SET compliance_status = 'RESTRICTED' WHERE id = ?", e.id);
    record(user, e, "restriction", `Restricted${reason.trim() ? `: ${reason.trim()}` : ""}.`);
    // It's no longer considered in the case, so what was built on it needs another look.
    flagForEvidence(e.case_id, e.id, `${e.reference} ${e.original_filename} was restricted and is no longer considered. Check whether this still holds without it.`);
    return "RESTRICTED";
  }
  run("UPDATE evidence SET compliance_status = 'PENDING_COMPLIANCE_REVIEW' WHERE id = ?", e.id);
  record(user, e, "restriction", "Restriction lifted.");
  return refreshEvidenceCompliance(e.id);
}

/**
 * External verification is a separate, controlled operation. It never runs
 * automatically, and with no approved integration it is refused and recorded.
 */
export function requestVerification(user: User, evidenceId: string): { status: VerificationStatus; explanation: string } {
  const e = getEvidenceForUser(user, evidenceId);
  try {
    authorise({ operation: "external_verification", provider: null, organisationId: user.organisation_id, caseId: e.case_id, evidenceId: e.id, user });
    // Unreachable in this release: no verification integration can be approved.
    throw new Error("No verification integration is connected");
  } catch (err) {
    const explanation = err instanceof ComplianceBlockedError ? err.result.explanation : REASONS.NO_VERIFICATION_INTEGRATION;
    run("UPDATE evidence SET verification_status = 'VERIFICATION_NOT_PERMITTED' WHERE id = ?", e.id);
    return { status: "VERIFICATION_NOT_PERMITTED", explanation };
  }
}
