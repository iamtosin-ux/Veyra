import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "../db";
import { HttpError, type User } from "../auth";
import {
  CRIMINAL_CATEGORIES,
  REASONS,
  SPECIAL_CATEGORIES,
  type Category,
  type ComplianceStatus,
  type Decision,
  type Operation,
  type PolicyConfig,
  type Provider,
  type ReasonCode,
} from "@/lib/compliance";
import { activePolicy, type Policy } from "./policy";
import { classifyIntake } from "./classify";
import { consentState } from "./consent";

// Server-enforced policy layer between evidence storage and every processing
// service. Deny by default: anything not explicitly allowed by an approved
// policy is blocked, and any failure in the check blocks too. These checks are
// safeguards, not legal determinations.

/** Everything the decision depends on, already loaded. Pure input to evaluate(). */
export interface DecisionInput {
  operation: Operation;
  provider: Provider | null;
  policy: Policy | null;
  actor: { organisation_id: string; role: string } | null; // null = an authorised background service acting on a user's earlier request
  organisationId: string; // the organisation that owns the case/evidence
  evidence?: {
    category: Category;
    category_confirmed: boolean;
    compliance_status: ComplianceStatus;
    human_approved: boolean;
    consent?: "active" | "withdrawn" | "none";
  };
}

export interface DecisionResult {
  decision: Decision;
  reasons: ReasonCode[];
  explanation: string;
  missing?: string[];
}

const RANK: Record<Decision, number> = { ALLOW: 0, REVIEW_REQUIRED: 1, BLOCK: 2 };

function missingPolicyFields(c: PolicyConfig): string[] {
  const out: string[] = [];
  if (!c.controller) out.push("data controller");
  if (!c.purpose) out.push("purpose of processing");
  if (!c.lawful_basis) out.push("Article 6 lawful basis");
  if (!c.roles.length) out.push("permitted roles");
  if (!c.retention_days) out.push("retention period");
  return out;
}

/** Pure decision. Returns ALLOW only when every configured requirement is met. */
export function evaluate(i: DecisionInput): DecisionResult {
  const reasons: [Decision, ReasonCode][] = [];
  const block = (r: ReasonCode) => reasons.push(["BLOCK", r]);
  const review = (r: ReasonCode) => reasons.push(["REVIEW_REQUIRED", r]);
  let missing: string[] | undefined;

  // Local integrity checks are an intake safeguard: nothing leaves Veyra.
  if (i.operation === "integrity_check" && i.provider === null) {
    if (i.actor && i.actor.organisation_id !== i.organisationId) block("TENANT_MISMATCH");
    else return { decision: "ALLOW", reasons: ["INTAKE_SAFEGUARD"], explanation: REASONS.INTAKE_SAFEGUARD };
  }

  const p = i.policy?.config;
  if (!i.policy || !p) block("NO_APPROVED_POLICY");
  else {
    if (i.policy.organisation_id !== i.organisationId) block("TENANT_MISMATCH");
    missing = missingPolicyFields(p);
    if (missing.length) block("POLICY_INCOMPLETE");
    if (p.veyra_role === "processor" && !p.processing_instructions) block("PROCESSING_INSTRUCTIONS_MISSING");
    if (p.dpia_required && p.dpia_status !== "approved") block("DPIA_NOT_APPROVED");
    if (i.actor && !p.roles.includes(i.actor.role)) block("ROLE_NOT_PERMITTED");
    if (!p.operations.includes(i.operation)) block("OPERATION_NOT_APPROVED");
    if (i.provider) {
      if (!p.providers.includes(i.provider)) block("PROVIDER_NOT_APPROVED");
      if (!p.transfer_arrangements) block("TRANSFER_NOT_DOCUMENTED");
    }
    if (i.operation === "external_verification") {
      if (!p.external_verification) block("VERIFICATION_NOT_PERMITTED");
      // No verification integration is connected in this release, so none can be approved.
      block("NO_VERIFICATION_INTEGRATION");
    }
  }
  if (i.actor && i.actor.organisation_id !== i.organisationId) block("TENANT_MISMATCH");

  if (i.evidence && p) {
    const e = i.evidence;
    if (e.compliance_status === "RESTRICTED") block("EVIDENCE_RESTRICTED");
    if (SPECIAL_CATEGORIES.includes(e.category)) {
      if (!p.special_category_condition || !p.schedule1_conditions) block("SPECIAL_CATEGORY_CONDITION_MISSING");
      if (!p.appropriate_policy_document) block("APPROPRIATE_POLICY_DOCUMENT_MISSING");
    }
    if (CRIMINAL_CATEGORIES.includes(e.category)) {
      if (!p.criminal_offence_condition) block("CRIMINAL_OFFENCE_CONDITION_MISSING");
      if (!p.appropriate_policy_document) block("APPROPRIATE_POLICY_DOCUMENT_MISSING");
    }
    if (e.category === "children" && p.dpia_status !== "approved") block("CHILDREN_DATA_NEEDS_DPIA");
    // Where consent is the lawful basis, it must be recorded and still in force. A person can't override this.
    if (p.lawful_basis === "consent") {
      if (e.consent === "withdrawn") block("CONSENT_WITHDRAWN");
      else if (e.consent !== "active") block("CONSENT_NOT_RECORDED");
    }
    // These need a responsible person; a recorded approval resolves them.
    if (!e.category_confirmed && !e.human_approved) review("CLASSIFICATION_UNCERTAIN");
    if (!p.categories.includes(e.category) && !e.human_approved) review("CATEGORY_NOT_COVERED");
  } else if (i.evidence && !p) {
    if (i.evidence.compliance_status === "RESTRICTED") block("EVIDENCE_RESTRICTED");
  }

  const unique = [...new Map(reasons.map(([d, r]) => [r, d])).entries()];
  const decision = unique.reduce<Decision>((d, [, x]) => (RANK[x] > RANK[d] ? x : d), "ALLOW");
  const codes = unique.map(([r]) => r);
  if (decision === "ALLOW") {
    const ok: ReasonCode[] = i.evidence?.human_approved ? ["HUMAN_APPROVED", "ALL_REQUIREMENTS_MET"] : ["ALL_REQUIREMENTS_MET"];
    return { decision, reasons: ok, explanation: ok.map((r) => REASONS[r]).join(" ") };
  }
  const shown = codes.filter((r) => unique.find(([c]) => c === r)![1] === decision);
  const text = shown.map((r) => (r === "POLICY_INCOMPLETE" && missing?.length ? `${REASONS[r]} Missing: ${missing.join(", ")}.` : REASONS[r])).join(" ");
  return { decision, reasons: codes, explanation: text, missing };
}

// ---------------------------------------------------------------------------
// Authorisations: proof that the engine allowed one specific operation.
// AI and verification services refuse to run without one.

export interface Authorisation {
  readonly auditId: string;
  readonly operation: Operation;
  readonly provider: Provider | null;
  readonly evidenceIds: readonly string[];
  readonly policyId: string | null;
  readonly policyVersion: number | null;
}

const issued = new WeakSet<Authorisation>();

export class ComplianceBlockedError extends HttpError {
  constructor(
    public readonly result: DecisionResult,
    public readonly auditId: string,
  ) {
    super(403, result.explanation || "Processing is not authorised");
  }
}

/** Services call this before touching a provider. Anything not issued by authorise() is refused. */
export function assertAuthorised(auth: Authorisation | null | undefined, provider: Provider | null, operation?: Operation): void {
  if (!auth || !issued.has(auth)) throw new HttpError(403, "Processing blocked: no compliance authorisation was presented");
  if (auth.provider !== provider) throw new HttpError(403, `Processing blocked: authorised for ${auth.provider ?? "local processing"}, not ${provider ?? "local processing"}`);
  if (operation && auth.operation !== operation) throw new HttpError(403, `Processing blocked: authorised for ${auth.operation}, not ${operation}`);
}

interface EvidenceFacts {
  id: string;
  case_id: string;
  organisation_id: string;
  category: Category;
  category_confirmed: number;
  compliance_status: ComplianceStatus;
  human_approval: string | null;
}

function evidenceFacts(evidenceId: string): EvidenceFacts | undefined {
  return get<EvidenceFacts>(
    `SELECT e.id, e.case_id, c.organisation_id, e.category, e.category_confirmed, e.compliance_status, e.human_approval
       FROM evidence e JOIN cases c ON c.id = e.case_id WHERE e.id = ?`,
    evidenceId,
  );
}

export interface AuthoriseRequest {
  operation: Operation;
  provider: Provider | null;
  organisationId: string;
  caseId?: string | null;
  evidenceId?: string | null;
  /** The signed-in user, or null for a background job acting on a user's earlier request. */
  user: User | null;
  actorLabel?: string;
  modelVersion?: string | null;
}

/**
 * Decide, audit, and (only on ALLOW) issue an Authorisation. Fails closed: any
 * error while checking is recorded as a BLOCK and thrown.
 */
export function authorise(req: AuthoriseRequest): Authorisation {
  let result: DecisionResult;
  let policy: Policy | null = null;
  try {
    policy = activePolicy(req.organisationId);
    const ev = req.evidenceId ? evidenceFacts(req.evidenceId) : undefined;
    if (req.evidenceId && !ev) throw new Error("Evidence not found");
    result = evaluate({
      operation: req.operation,
      provider: req.provider,
      policy,
      actor: req.user ? { organisation_id: req.user.organisation_id, role: req.user.role } : null,
      organisationId: ev?.organisation_id ?? req.organisationId,
      evidence: ev
        ? { category: ev.category, category_confirmed: !!ev.category_confirmed, compliance_status: ev.compliance_status, human_approved: !!ev.human_approval, consent: consentState(ev.id) }
        : undefined,
    });
    if (ev && ev.organisation_id !== req.organisationId) result = { decision: "BLOCK", reasons: ["TENANT_MISMATCH"], explanation: REASONS.TENANT_MISMATCH };
  } catch (e) {
    console.error("[compliance] check failed, blocking:", e instanceof Error ? e.message : e);
    result = { decision: "BLOCK", reasons: ["ENGINE_ERROR"], explanation: REASONS.ENGINE_ERROR };
  }
  const auditId = audit({
    organisationId: req.organisationId,
    caseId: req.caseId ?? null,
    evidenceId: req.evidenceId ?? null,
    user: req.user,
    actor: req.actorLabel ?? (req.user ? req.user.name : "Veyra background service"),
    operation: req.operation,
    purpose: policy?.config.purpose ?? null,
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    decision: result.decision,
    reasons: result.reasons,
    explanation: result.explanation,
    provider: req.provider,
    modelVersion: req.modelVersion ?? null,
  });
  if (result.decision !== "ALLOW") throw new ComplianceBlockedError(result, auditId);
  const auth: Authorisation = Object.freeze({
    auditId,
    operation: req.operation,
    provider: req.provider,
    evidenceIds: Object.freeze(req.evidenceId ? [req.evidenceId] : []),
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
  });
  issued.add(auth);
  return auth;
}

/** Evaluate without auditing or issuing anything, e.g. to show status in the UI. */
export function preview(req: Omit<AuthoriseRequest, "actorLabel" | "modelVersion">): DecisionResult {
  try {
    const ev = req.evidenceId ? evidenceFacts(req.evidenceId) : undefined;
    return evaluate({
      operation: req.operation,
      provider: req.provider,
      policy: activePolicy(req.organisationId),
      actor: req.user ? { organisation_id: req.user.organisation_id, role: req.user.role } : null,
      organisationId: ev?.organisation_id ?? req.organisationId,
      evidence: ev ? { category: ev.category, category_confirmed: !!ev.category_confirmed, compliance_status: ev.compliance_status, human_approved: !!ev.human_approval, consent: consentState(ev.id) } : undefined,
    });
  } catch {
    return { decision: "BLOCK", reasons: ["ENGINE_ERROR"], explanation: REASONS.ENGINE_ERROR };
  }
}

/** Record on the audit entry how many identifiers were masked before data left Veyra. */
export function noteMasking(auth: Authorisation, count: number) {
  run("UPDATE processing_audit SET explanation = explanation || ? WHERE id = ?", ` ${count} direct identifier(s) were masked before sending.`, auth.auditId);
}

/** Record the outcome of an authorised operation against its audit entry. */
export function completeAudit(auditId: string, status: "completed" | "failed", resultRef?: string | null) {
  run("UPDATE processing_audit SET status = ?, result_ref = COALESCE(?, result_ref) WHERE id = ?", status, resultRef ?? null, auditId);
}

// ---------------------------------------------------------------------------
// Audit trail. Records what happened and why, never the evidence contents.

export interface AuditInput {
  organisationId: string;
  caseId: string | null;
  evidenceId: string | null;
  user: { id: string } | null;
  actor: string;
  operation: Operation | "intake" | "human_approval" | "restriction" | "policy_change" | "classification" | "file_access" | "deletion" | "retention" | "consent" | "subject_request";
  purpose: string | null;
  policyId: string | null;
  policyVersion: number | null;
  decision: Decision | "RECORDED";
  reasons: string[];
  explanation: string;
  provider: Provider | null;
  modelVersion?: string | null;
  resultRef?: string | null;
}

export function audit(a: AuditInput): string {
  const id = crypto.randomUUID();
  run(
    `INSERT INTO processing_audit (id, organisation_id, case_id, evidence_id, actor_user_id, actor, operation, purpose, policy_id, policy_version,
       decision, reason_codes, explanation, provider, status, result_ref, model_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    a.organisationId,
    a.caseId,
    a.evidenceId,
    a.user?.id ?? null,
    a.actor,
    a.operation,
    a.purpose,
    a.policyId,
    a.policyVersion,
    a.decision,
    JSON.stringify(a.reasons),
    a.explanation,
    a.provider,
    a.decision === "ALLOW" ? "authorised" : a.decision === "RECORDED" ? "recorded" : "blocked",
    a.resultRef ?? null,
    a.modelVersion ?? null,
    now(),
  );
  return id;
}

export interface AuditEntry {
  id: string;
  actor: string;
  operation: string;
  decision: string;
  reason_codes: string[];
  explanation: string;
  provider: string | null;
  policy_version: number | null;
  status: string;
  model_version: string | null;
  created_at: string;
}

/** Audit entries for one evidence item, scoped to the caller's organisation. */
export function evidenceAudit(user: User, evidenceId: string): AuditEntry[] {
  return all<AuditEntry & { reason_codes: string }>(
    "SELECT id, actor, operation, decision, reason_codes, explanation, provider, policy_version, status, model_version, created_at FROM processing_audit WHERE evidence_id = ? AND organisation_id = ? ORDER BY created_at DESC LIMIT 100",
    evidenceId,
    user.organisation_id,
  ).map((r) => ({ ...r, reason_codes: parseJson<string[]>(r.reason_codes as unknown as string, []) }));
}

/** Organisation of a case, used by background jobs that only know the case. */
export function caseOrganisation(caseId: string): string {
  const r = get<{ organisation_id: string }>("SELECT organisation_id FROM cases WHERE id = ?", caseId);
  if (!r) throw new HttpError(404, "Case not found");
  return r.organisation_id;
}

/** The compliance status shown for an item: its decision for core analysis, unless a person restricted it. */
export function refreshEvidenceCompliance(evidenceId: string): ComplianceStatus {
  const ev = evidenceFacts(evidenceId);
  if (!ev) return "BLOCKED";
  if (ev.compliance_status === "RESTRICTED") return "RESTRICTED";
  const r = preview({ operation: "observations", provider: "anthropic", organisationId: ev.organisation_id, evidenceId, user: null });
  const status: ComplianceStatus = r.decision === "ALLOW" ? "APPROVED" : r.decision === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "BLOCKED";
  run("UPDATE evidence SET compliance_status = ?, compliance_reasons = ? WHERE id = ?", status, JSON.stringify(r.reasons), evidenceId);
  return status;
}

/** Re-evaluate every item in an organisation, e.g. after its policy changes. */
export function refreshOrganisationCompliance(organisationId: string) {
  for (const { id } of all<{ id: string }>("SELECT e.id FROM evidence e JOIN cases c ON c.id = e.case_id WHERE c.organisation_id = ?", organisationId)) refreshEvidenceCompliance(id);
}

/** Evidence stored before classification existed: classify from its name and re-check every organisation. */
export function backfillCompliance() {
  const rows = all<{ id: string; original_filename: string; evidence_type: string }>(
    "SELECT id, original_filename, evidence_type FROM evidence WHERE category_source = 'default' AND category_confirmed = 0 AND category = 'general'",
  );
  for (const r of rows) {
    const c = classifyIntake(r.original_filename, r.evidence_type, null);
    run("UPDATE evidence SET category = ?, category_source = ?, category_confirmed = ? WHERE id = ?", c.category, c.source, c.confirmed ? 1 : 0, r.id);
  }
  for (const { id } of all<{ id: string }>("SELECT id FROM organisations")) refreshOrganisationCompliance(id);
  return rows.length;
}
