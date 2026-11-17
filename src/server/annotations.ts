import crypto from "node:crypto";
import { get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, nextReference, touchCase } from "./cases";
import { postMessage } from "./assistant/assistant";
import { flagForObservations } from "./reassessment";
import { formatTimestamp } from "@/lib/types";

// Reviewer annotations on media. They are stored as observations so the next
// analysis uses them, marked as written by a person, and survive re-processing.

function evidenceFor(user: User, evidenceId: string) {
  const e = get<{ id: string; case_id: string; reference: string; original_filename: string; evidence_type: string; file_hash: string }>(
    "SELECT id, case_id, reference, original_filename, evidence_type, file_hash FROM evidence WHERE id = ?",
    evidenceId,
  );
  if (!e) throw new HttpError(404, "Evidence not found");
  getCaseForUser(user, e.case_id);
  return e;
}

/** One completed run per item holds its reviewer annotations. */
function reviewerRun(caseId: string, evidenceId: string, hash: string): string {
  const existing = get<{ id: string }>("SELECT id FROM analysis_runs WHERE evidence_id = ? AND model_identifier = 'reviewer' LIMIT 1", evidenceId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = now();
  run(
    "INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, model_identifier, evidence_hash, started_at, completed_at, created_at) VALUES (?, ?, ?, 'evidence', 'completed', 'Reviewer annotations', 'reviewer', ?, ?, ?, ?)",
    id,
    caseId,
    evidenceId,
    hash,
    ts,
    ts,
    ts,
  );
  return id;
}

export function addAnnotation(user: User, evidenceId: string, input: { start: number; end?: number | null; description: string }) {
  const e = evidenceFor(user, evidenceId);
  const text = input.description.trim();
  if (!text) throw new HttpError(400, "Describe what happens at this point");
  const start = Math.max(0, input.start);
  const end = input.end != null && input.end > start ? input.end : null;
  const id = crypto.randomUUID();
  const reference = nextReference(e.case_id, "observation");
  run(
    `INSERT INTO observations (id, case_id, evidence_id, analysis_run_id, reference, observation_type, modality, description, quote, source_reference, event_time, uncertainty, review_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'direct_observation', 'reviewer', ?, NULL, ?, NULL, ?, 'accepted', ?)`,
    id,
    e.case_id,
    e.id,
    reviewerRun(e.case_id, e.id, e.file_hash),
    reference,
    text,
    JSON.stringify({ kind: e.evidence_type === "audio" ? "audio" : "video", start_time_seconds: start, end_time_seconds: end, precision: "exact", precision_note: `Annotation by ${user.name}` }),
    JSON.stringify({ requires_review: false, reason: null, source: "reviewer", author: user.name }),
    now(),
  );
  touchCase(e.case_id);
  postMessage(e.case_id, "assistant", { text: `${user.name} added annotation ${reference} to ${e.original_filename} at ${formatTimestamp(start)}: “${text}”. It will be used the next time Veyra analyses the case.` }, user.id);
  return { id, reference };
}

/** Removing an annotation or observation takes it out of future analysis; findings that cited it are flagged in Review. */
export function removeObservation(user: User, observationId: string) {
  const o = get<{ id: string; case_id: string; reference: string; evidence_id: string }>("SELECT id, case_id, reference, evidence_id FROM observations WHERE id = ?", observationId);
  if (!o) throw new HttpError(404, "Observation not found");
  getCaseForUser(user, o.case_id);
  run("UPDATE observations SET superseded = 1, review_status = 'rejected' WHERE id = ?", o.id);
  flagForObservations(o.case_id, [o.id], `${o.reference} was removed by a reviewer. Check whether this still holds without it.`);
  touchCase(o.case_id);
  const file = get<{ original_filename: string }>("SELECT original_filename FROM evidence WHERE id = ?", o.evidence_id)?.original_filename ?? "the evidence";
  postMessage(o.case_id, "assistant", { text: `${user.name} removed ${o.reference} from ${file}. It is excluded from future analysis; findings that cited it will be flagged for review.` }, user.id);
}
