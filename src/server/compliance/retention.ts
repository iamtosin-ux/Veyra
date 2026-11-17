import { all, get, run } from "../db";
import { HttpError, type User } from "../auth";
import { getCaseForUser } from "../cases";
import { removeEvidence } from "../integrityReview";
import { audit } from "./engine";
import { activePolicy } from "./policy";

// Retention as the organisation's policy defines it. Nothing is deleted
// automatically: items past their retention period are listed for an
// administrator, who deletes them or puts the case on legal hold.

export function retentionReview(user: User) {
  const policy = activePolicy(user.organisation_id);
  if (!policy) return { retention_days: null, due: [], holds: [] };
  const cutoff = new Date(Date.now() - policy.config.retention_days * 86_400_000).toISOString();
  const due = all<{ id: string; reference: string; original_filename: string; uploaded_at: string; case_id: string; case_title: string }>(
    `SELECT e.id, e.reference, e.original_filename, e.uploaded_at, c.id case_id, c.title case_title
       FROM evidence e JOIN cases c ON c.id = e.case_id
      WHERE c.organisation_id = ? AND c.legal_hold = 0 AND e.uploaded_at < ?
      ORDER BY e.uploaded_at LIMIT 500`,
    user.organisation_id,
    cutoff,
  );
  const holds = all<{ id: string; title: string; legal_hold_reason: string | null }>(
    "SELECT id, title, legal_hold_reason FROM cases WHERE organisation_id = ? AND legal_hold = 1 ORDER BY title",
    user.organisation_id,
  );
  return { retention_days: policy.config.retention_days, due, holds };
}

function requireAdmin(user: User) {
  if (user.role !== "admin") throw new HttpError(403, "Only an administrator can manage retention");
}

/** Delete items that are past retention. Each must still be due, and not under legal hold. */
export function deleteDue(user: User, evidenceIds: string[]): number {
  requireAdmin(user);
  const due = new Set(retentionReview(user).due.map((d) => d.id));
  let n = 0;
  for (const id of evidenceIds) {
    if (!due.has(id)) throw new HttpError(409, "An item is no longer due for deletion; refresh and try again");
    const e = get<{ case_id: string; reference: string }>("SELECT case_id, reference FROM evidence WHERE id = ?", id)!;
    removeEvidence(user, id);
    audit({
      organisationId: user.organisation_id,
      caseId: e.case_id,
      evidenceId: id,
      user,
      actor: user.name,
      operation: "deletion",
      purpose: null,
      policyId: activePolicy(user.organisation_id)?.id ?? null,
      policyVersion: activePolicy(user.organisation_id)?.version ?? null,
      decision: "RECORDED",
      reasons: ["RETENTION_EXPIRED"],
      explanation: `${e.reference} deleted after its retention period.`,
      provider: null,
    });
    n++;
  }
  return n;
}

export function setLegalHold(user: User, caseId: string, hold: boolean, reason: string) {
  requireAdmin(user);
  getCaseForUser(user, caseId);
  if (hold && !reason.trim()) throw new HttpError(400, "Record why the case is on legal hold");
  run("UPDATE cases SET legal_hold = ?, legal_hold_reason = ? WHERE id = ?", hold ? 1 : 0, hold ? reason.trim() : null, caseId);
  audit({
    organisationId: user.organisation_id,
    caseId,
    evidenceId: null,
    user,
    actor: user.name,
    operation: "retention",
    purpose: null,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: hold ? `Legal hold placed: ${reason.trim()}` : "Legal hold released.",
    provider: null,
  });
}
