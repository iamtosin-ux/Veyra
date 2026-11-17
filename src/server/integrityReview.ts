import crypto from "node:crypto";
import { z } from "zod";
import { all, get, now, parseJson, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { getEvidenceForUser } from "./evidence";
import { enqueueJob } from "./jobs";
import { createInvite } from "./invites";
import { postMessage } from "./assistant/assistant";
import { latestIntegrity } from "./analysis/integrity";
import { removeEvidenceFiles } from "./storage";
import { flagForEvidence } from "./reassessment";
import { authorise, type Authorisation } from "./compliance/engine";
import { AiNotConfiguredError, MODEL, callStructured } from "./ai/client";

// What a reviewer does about a flagged integrity result: keep the file, remove
// it, or ask whoever provided it for a replacement.

export interface IntegrityReview {
  evidence_id: string;
  decision: "kept" | "replacement_requested";
  note: string | null;
  invite_id: string | null;
  decided_by_name: string | null;
  created_at: string;
}

/** Queue a fresh check of every item in the case; runs in the background worker. */
export function queueCaseIntegrity(user: User, caseId: string): string[] {
  getCaseForUser(user, caseId);
  const ids = all<{ id: string }>("SELECT id FROM evidence WHERE case_id = ?", caseId).map((r) => r.id);
  for (const id of ids) enqueueJob("check_integrity", { evidenceId: id });
  return ids;
}

/** Items in the case with an integrity check still queued or running. */
export function pendingIntegrity(caseId: string): string[] {
  const rows = all<{ payload: string }>(
    `SELECT j.payload FROM jobs j WHERE j.kind = 'check_integrity' AND j.status IN ('queued', 'running')
       AND EXISTS (SELECT 1 FROM evidence e WHERE e.case_id = ? AND j.payload LIKE '%' || e.id || '%')`,
    caseId,
  );
  return [...new Set(rows.map((r) => parseJson<{ evidenceId: string }>(r.payload, { evidenceId: "" }).evidenceId).filter(Boolean))];
}

export function caseIntegrityReviews(caseId: string): Record<string, IntegrityReview> {
  const rows = all<IntegrityReview>(
    `SELECT r.evidence_id, r.decision, r.note, r.invite_id, u.name decided_by_name, r.created_at
       FROM integrity_reviews r LEFT JOIN users u ON u.id = r.decided_by
      WHERE r.case_id = ? AND r.created_at = (SELECT MAX(created_at) FROM integrity_reviews x WHERE x.evidence_id = r.evidence_id)`,
    caseId,
  );
  return Object.fromEntries(rows.map((r) => [r.evidence_id, r]));
}

function record(user: User, evidenceId: string, caseId: string, decision: IntegrityReview["decision"], note: string | null, inviteId: string | null) {
  run(
    "INSERT INTO integrity_reviews (id, evidence_id, case_id, decision, note, invite_id, decided_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    evidenceId,
    caseId,
    decision,
    note,
    inviteId,
    user.id,
    now(),
  );
  touchCase(caseId);
}

/** The reviewer has looked at the flags and is keeping the file as it is. */
export function keepEvidence(user: User, evidenceId: string) {
  const e = getEvidenceForUser(user, evidenceId);
  record(user, e.id, e.case_id, "kept", null, null);
  postMessage(e.case_id, "assistant", { text: `${user.name} reviewed the integrity flags on ${e.reference} ${e.original_filename} and kept it.` }, user.id);
}

function contributorOf(metadata: string) {
  const m = parseJson<{ upload_source?: string; contributor_name?: string | null; contributor_email?: string | null; relationship?: string | null; invite_id?: string }>(metadata, {});
  if (m.upload_source !== "invite") return null;
  return { name: m.contributor_name ?? null, email: m.contributor_email ?? null, relationship: m.relationship ?? null };
}

/** A note asking the contributor for a better copy, explaining why. Drafted by AI when it's set up; otherwise from the flags. */
export async function draftReplacementNote(user: User, evidenceId: string): Promise<{ message: string; drafted_by: "ai" | "template" }> {
  const e = getEvidenceForUser(user, evidenceId);
  const report = latestIntegrity(e.id);
  const who = contributorOf(e.metadata);
  const issues = (report?.indicators ?? []).filter((i) => i.level !== "info");
  const greeting = who?.name ? `Hi ${who.name.split(" ")[0]},` : "Hello,";
  const reasons = issues.length ? issues.map((i) => `- ${i.title}`).join("\n") : "- We couldn't confirm the file is an original.";
  const template = `${greeting}\n\nThank you for sending ${e.original_filename}. When we checked it, we found:\n${reasons}\n\nCould you upload the original file, exactly as it came from the device or the organisation that issued it, without editing, screenshotting or converting it? You can use the link below.\n\nThank you,\n${user.name}`;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return { message: template, drafted_by: "template" };
  // The draft sends the integrity findings to the AI provider, so it needs the policy's approval like any other processing.
  let auth: Authorisation;
  try {
    auth = authorise({ operation: "case_preparation", provider: "anthropic", organisationId: user.organisation_id, caseId: e.case_id, evidenceId: e.id, user, modelVersion: MODEL });
  } catch {
    return { message: template, drafted_by: "template" };
  }
  try {
    // AI usage is recorded against an analysis run, so the draft gets a small one of its own.
    const runId = crypto.randomUUID();
    const ts = now();
    run(
      "INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, model_identifier, evidence_hash, started_at, completed_at, created_at) VALUES (?, ?, ?, 'evidence', 'completed', 'Replacement request note', ?, ?, ?, ?, ?)",
      runId,
      e.case_id,
      e.id,
      MODEL,
      e.file_hash,
      ts,
      ts,
      ts,
    );
    const out = await callStructured({
      authorisation: auth,
      runId,
      purpose: "integrity_replacement_note",
      system:
        "You write short, polite, plain-English messages asking someone who supplied a document or recording to send the original instead. Explain briefly why, using the findings given, without accusing anyone of tampering. No legal jargon. Under 120 words. Sign off with the sender's name.",
      content: [{ type: "text", text: JSON.stringify({ sender: user.name, contributor: who?.name ?? null, file: e.original_filename, findings: issues.map((i) => ({ title: i.title, detail: i.detail })) }) }],
      schema: z.object({ message: z.string() }),
      effort: "low",
      maxTokens: 2000,
    });
    return { message: out.message.trim(), drafted_by: "ai" };
  } catch (err) {
    if (!(err instanceof AiNotConfiguredError)) console.warn("[integrity] draft failed, using template:", err instanceof Error ? err.message : err);
    return { message: template, drafted_by: "template" };
  }
}

/** Ask the contributor for a replacement: a new upload link for them, carrying the reviewer's note. */
export function requestReplacement(user: User, evidenceId: string, message: string) {
  const e = getEvidenceForUser(user, evidenceId);
  const who = contributorOf(e.metadata);
  if (!who) throw new HttpError(400, "This file wasn't sent by an external contributor");
  if (!message.trim()) throw new HttpError(400, "Add a note explaining why you need another copy");
  const invite = createInvite(user, e.case_id, {
    label: `Replacement for ${e.original_filename}`,
    message,
    days: 14,
    relationship: who.relationship,
    contact: who.email,
  });
  record(user, e.id, e.case_id, "replacement_requested", message.trim(), invite.id);
  postMessage(e.case_id, "assistant", { text: `${user.name} asked ${who.name ?? "the contributor"} for a replacement of ${e.reference} ${e.original_filename}.` }, user.id);
  return { invite_id: invite.id, token: invite.token, email: who.email };
}

/** Remove one evidence item and everything derived from it. Findings that cited it lose that source. */
export function removeEvidence(user: User, evidenceId: string) {
  const e = getEvidenceForUser(user, evidenceId);
  const cited = all<{ reference: string }>("SELECT DISTINCT f.reference FROM findings f JOIN finding_sources s ON s.finding_id = f.id WHERE s.evidence_id = ?", e.id).map((r) => r.reference);
  // Flag before the item's observations (and so the links to its findings) are deleted.
  flagForEvidence(e.case_id, e.id, `${e.reference} ${e.original_filename} was removed from the case. Check whether this still holds without it.`);
  tx(() => {
    run("UPDATE evidence SET duplicate_of = NULL WHERE duplicate_of = ?", e.id);
    for (const c of all<{ id: string; evidence_ids: string }>("SELECT id, evidence_ids FROM chronology_events WHERE case_id = ? AND evidence_ids LIKE ?", e.case_id, `%${e.id}%`)) {
      run("UPDATE chronology_events SET evidence_ids = ? WHERE id = ?", JSON.stringify(parseJson<string[]>(c.evidence_ids, []).filter((x) => x !== e.id)), c.id);
    }
    // Case copies of a removed vault file stay; only their link back is dropped.
    run("UPDATE evidence SET vault_item_id = NULL WHERE vault_item_id = ?", e.id);
    run("DELETE FROM evidence WHERE id = ?", e.id);
  });
  // The original may be shared with a vault folder or other cases.
  removeEvidenceFiles(e.storage_reference, e.id, !!get("SELECT 1 FROM evidence WHERE storage_reference = ?", e.storage_reference));
  touchCase(e.case_id);
  postMessage(
    e.case_id,
    "assistant",
    { text: `${user.name} removed ${e.reference} ${e.original_filename} from the case.${cited.length ? ` Findings that cited it (${cited.join(", ")}) should be reviewed.` : ""}` },
    user.id,
  );
  return { case_id: e.case_id };
}

