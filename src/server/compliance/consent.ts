import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "../db";
import { HttpError, type User } from "../auth";
import { getCaseForUser } from "../cases";
import { flagForEvidence } from "../reassessment";
import { audit, refreshEvidenceCompliance } from "./engine";

// Consent records, for organisations whose policy relies on consent. Consent is
// never assumed from an upload: a person records who gave it, for what, and how.
// Withdrawal stops further processing of the items it covered and flags
// findings built on them; it doesn't erase anything by itself.

export interface ConsentRecord {
  id: string;
  case_id: string;
  subject_name: string;
  subject_contact: string | null;
  purpose: string;
  method: "written" | "electronic" | "verbal";
  evidence_ids: string[];
  given_at: string;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  created_at: string;
}

type Row = Omit<ConsentRecord, "evidence_ids"> & { evidence_ids: string };
const toRecord = (r: Row): ConsentRecord => ({ ...r, evidence_ids: parseJson<string[]>(r.evidence_ids, []) });

export function listConsents(user: User, caseId: string): ConsentRecord[] {
  getCaseForUser(user, caseId);
  return all<Row>("SELECT * FROM consent_records WHERE case_id = ? AND organisation_id = ? ORDER BY created_at DESC", caseId, user.organisation_id).map(toRecord);
}

/** Items a record covers: the listed ones, or the whole case when none are listed. */
function covered(r: ConsentRecord): string[] {
  return r.evidence_ids.length ? r.evidence_ids : all<{ id: string }>("SELECT id FROM evidence WHERE case_id = ?", r.case_id).map((e) => e.id);
}

/** Whether an item has active consent, only withdrawn consent, or none recorded. */
export function consentState(evidenceId: string): "active" | "withdrawn" | "none" {
  const e = get<{ case_id: string }>("SELECT case_id FROM evidence WHERE id = ?", evidenceId);
  if (!e) return "none";
  const records = all<Row>("SELECT * FROM consent_records WHERE case_id = ?", e.case_id)
    .map(toRecord)
    .filter((r) => !r.evidence_ids.length || r.evidence_ids.includes(evidenceId));
  if (records.some((r) => !r.withdrawn_at)) return "active";
  return records.length ? "withdrawn" : "none";
}

export function recordConsent(
  user: User,
  caseId: string,
  input: { subject_name: string; subject_contact?: string | null; purpose: string; method: ConsentRecord["method"]; evidence_ids?: string[]; given_at?: string | null },
): ConsentRecord {
  getCaseForUser(user, caseId);
  if (!input.subject_name.trim() || !input.purpose.trim()) throw new HttpError(400, "Record who gave consent and what it's for");
  const ids = (input.evidence_ids ?? []).filter((id) => get("SELECT id FROM evidence WHERE id = ? AND case_id = ?", id, caseId));
  const id = crypto.randomUUID();
  const ts = now();
  run(
    "INSERT INTO consent_records (id, organisation_id, case_id, subject_name, subject_contact, purpose, method, evidence_ids, given_at, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.organisation_id,
    caseId,
    input.subject_name.trim(),
    input.subject_contact?.trim() || null,
    input.purpose.trim(),
    input.method,
    JSON.stringify(ids),
    input.given_at || ts,
    user.id,
    ts,
  );
  const rec = toRecord(get<Row>("SELECT * FROM consent_records WHERE id = ?", id)!);
  audit({
    organisationId: user.organisation_id,
    caseId,
    evidenceId: null,
    user,
    actor: user.name,
    operation: "consent",
    purpose: rec.purpose,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: `Consent recorded (${rec.method}) for ${ids.length ? `${ids.length} item(s)` : "the whole case"}.`,
    provider: null,
  });
  for (const e of covered(rec)) refreshEvidenceCompliance(e);
  return rec;
}

/** Record a withdrawal. Further processing of the covered items stops; dependent findings are flagged. */
export function withdrawConsent(user: User, consentId: string, reason: string): { record: ConsentRecord; affected: number; flagged: number } {
  const row = get<Row>("SELECT * FROM consent_records WHERE id = ? AND organisation_id = ?", consentId, user.organisation_id);
  if (!row) throw new HttpError(404, "Consent record not found");
  if (row.withdrawn_at) throw new HttpError(409, "This consent was already withdrawn");
  run("UPDATE consent_records SET withdrawn_at = ?, withdrawn_reason = ?, withdrawn_recorded_by = ? WHERE id = ?", now(), reason.trim() || null, user.id, consentId);
  const rec = toRecord(get<Row>("SELECT * FROM consent_records WHERE id = ?", consentId)!);
  let flagged = 0;
  const items = covered(rec);
  for (const e of items) {
    flagged += flagForEvidence(rec.case_id, e, `Consent from ${rec.subject_name} was withdrawn. Check whether this can still be relied on.`);
    refreshEvidenceCompliance(e);
  }
  audit({
    organisationId: user.organisation_id,
    caseId: rec.case_id,
    evidenceId: null,
    user,
    actor: user.name,
    operation: "consent",
    purpose: rec.purpose,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: ["CONSENT_WITHDRAWN"],
    explanation: `Consent withdrawn${reason.trim() ? `: ${reason.trim()}` : ""}. ${items.length} item(s) affected, ${flagged} finding(s) flagged for reassessment.`,
    provider: null,
  });
  return { record: rec, affected: items.length, flagged };
}
