import crypto from "node:crypto";
import { precedentsForCase } from "./precedents";
import { activityRows } from "./activities";
import { clearReassessment, flagRelatedToFinding } from "./reassessment";
import { all, get, now, parseJson, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import type { EventTime, FindingType, ReviewStatus, SourceReference, Uncertainty } from "@/lib/types";

interface FindingRow {
  archived_at: string | null;
  id: string;
  case_id: string;
  analysis_run_id: string;
  reference: string;
  title: string;
  description: string;
  finding_type: FindingType;
  relationship_explanation: string | null;
  uncertainty: string;
  review_status: ReviewStatus;
  superseded: number;
  version: number;
  created_at: string;
  updated_at: string;
  reassess_reason: string | null;
  reassess_at: string | null;
}

export interface FindingContent {
  title: string;
  description: string;
  finding_type: FindingType;
  relationship_explanation: string | null;
  review_status: ReviewStatus;
  version: number;
}

function snapshot(f: FindingRow): FindingContent {
  return {
    title: f.title,
    description: f.description,
    finding_type: f.finding_type,
    relationship_explanation: f.relationship_explanation,
    review_status: f.review_status,
    version: f.version,
  };
}

export function listFindings(caseId: string, opts: { includeSuperseded?: boolean } = {}) {
  const rows = all<FindingRow>(
    `SELECT * FROM findings WHERE case_id = ? ${opts.includeSuperseded ? "" : "AND superseded = 0 AND archived_at IS NULL"} ORDER BY reference`,
    caseId,
  );
  const sources = all<{
    finding_id: string;
    observation_id: string;
    evidence_id: string;
    source_reference: string;
    evidence_reference: string;
    evidence_filename: string;
    evidence_type: string;
    observation_reference: string;
    observation_type: string;
    observation_description: string;
    quote: string | null;
    event_time: string | null;
  }>(
    `SELECT fs.finding_id, fs.observation_id, fs.evidence_id, fs.source_reference,
            e.reference evidence_reference, e.original_filename evidence_filename, e.evidence_type, o.reference observation_reference,
            o.observation_type, o.description observation_description, o.quote, o.event_time
       FROM finding_sources fs
       JOIN findings f ON f.id = fs.finding_id
       JOIN evidence e ON e.id = fs.evidence_id
       JOIN observations o ON o.id = fs.observation_id
      WHERE f.case_id = ?
      ORDER BY o.reference`,
    caseId,
  );
  const reviews = all<{ finding_id: string; id: string; action: string; previous_content: string; updated_content: string | null; review_note: string | null; reviewed_at: string; reviewer_name: string }>(
    `SELECT r.*, u.name reviewer_name FROM finding_reviews r JOIN users u ON u.id = r.reviewer_id
      JOIN findings f ON f.id = r.finding_id WHERE f.case_id = ? ORDER BY r.reviewed_at`,
    caseId,
  );
  const precedents = precedentsForCase(caseId);
  return rows.map((f) => ({
    ...f,
    precedents: precedents.filter((p) => p.finding_id === f.id),
    superseded: !!f.superseded,
    archived: !!f.archived_at,
    uncertainty: parseJson<Uncertainty>(f.uncertainty, { requires_review: true, reason: null }),
    sources: sources
      .filter((s) => s.finding_id === f.id)
      .map((s) => ({
        ...s,
        source_reference: parseJson<SourceReference>(s.source_reference, {} as SourceReference),
        event_time: parseJson<EventTime | null>(s.event_time, null),
      })),
    history: reviews
      .filter((r) => r.finding_id === f.id)
      .map((r) => ({
        ...r,
        previous_content: parseJson<FindingContent | null>(r.previous_content, null),
        updated_content: parseJson<FindingContent | null>(r.updated_content, null),
      })),
  }));
}

export type ReviewAction = "accept" | "correct" | "reject" | "reset" | "archive" | "unarchive";

/**
 * Apply a review action. Every action writes an audit record holding the
 * content before and after; corrections bump the version so earlier versions
 * remain recoverable from the history.
 */
export function reviewFinding(
  user: User,
  findingId: string,
  action: ReviewAction,
  input: { title?: string; description?: string; note?: string | null },
) {
  const f = get<FindingRow>("SELECT * FROM findings WHERE id = ?", findingId);
  if (!f) throw new HttpError(404, "Finding not found");
  getCaseForUser(user, f.case_id);
  if (f.superseded) throw new HttpError(409, "This finding was superseded by a newer analysis and is read-only");

  return tx(() => {
    const before = snapshot(f);
    if (action === "archive" || action === "unarchive") {
      const ts = now();
      run("UPDATE findings SET archived_at = ?, updated_at = ? WHERE id = ?", action === "archive" ? ts : null, ts, f.id);
      run(
        `INSERT INTO finding_reviews (id, finding_id, reviewer_id, action, previous_content, updated_content, review_note, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(), f.id, user.id, action, JSON.stringify(before), JSON.stringify(before), input.note?.trim() || null, ts,
      );
      touchCase(f.case_id);
      return before;
    }
    let after: FindingContent;
    switch (action) {
      case "accept":
        after = { ...before, review_status: "accepted" };
        break;
      case "reject":
        after = { ...before, review_status: "rejected" };
        break;
      case "reset":
        after = { ...before, review_status: "unreviewed" };
        break;
      case "correct": {
        const title = input.title?.trim();
        const description = input.description?.trim();
        if (!title || !description) throw new HttpError(400, "A correction needs a title and description");
        if (title === f.title && description === f.description) throw new HttpError(400, "The correction does not change the finding");
        after = { ...before, title, description, review_status: "corrected", version: f.version + 1 };
        break;
      }
      default:
        throw new HttpError(400, "Unknown review action");
    }
    const ts = now();
    run(
      "UPDATE findings SET title = ?, description = ?, review_status = ?, version = ?, updated_at = ? WHERE id = ?",
      after.title,
      after.description,
      after.review_status,
      after.version,
      ts,
      f.id,
    );
    // Reviewing a finding settles any reassessment flag on it; rejecting or
    // correcting it flags other findings that rest on the same observations.
    clearReassessment(f.id);
    if (action === "reject" || action === "correct") flagRelatedToFinding(f.case_id, f.id, f.reference, action);
    run(
      `INSERT INTO finding_reviews (id, finding_id, reviewer_id, action, previous_content, updated_content, review_note, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      f.id,
      user.id,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      input.note?.trim() || null,
      ts,
    );
    touchCase(f.case_id);
    return after;
  });
}

/** The original AI-generated version of a finding, recovered from the audit trail. */
export function originalVersion(findingId: string): FindingContent | null {
  const first = get<{ previous_content: string }>(
    "SELECT previous_content FROM finding_reviews WHERE finding_id = ? ORDER BY reviewed_at LIMIT 1",
    findingId,
  );
  return first ? parseJson<FindingContent | null>(first.previous_content, null) : null;
}

export function reviewChronologyEvent(user: User, eventId: string, status: "accepted" | "rejected" | "unreviewed") {
  const ev = get<{ case_id: string }>("SELECT case_id FROM chronology_events WHERE id = ?", eventId);
  if (!ev) throw new HttpError(404, "Event not found");
  getCaseForUser(user, ev.case_id);
  run("UPDATE chronology_events SET review_status = ? WHERE id = ?", status, eventId);
  touchCase(ev.case_id);
}

export function listChronology(caseId: string) {
  const evRows = all<{ id: string; reference: string; evidence_type: string }>("SELECT id, reference, evidence_type FROM evidence WHERE case_id = ?", caseId);
  const evRefs = new Map(evRows.map((r) => [r.id, r.reference]));
  const evTypes = new Map(evRows.map((r) => [r.id, r.evidence_type]));
  const obs = new Map(
    all<{ id: string; reference: string; evidence_id: string; source_reference: string; description: string }>(
      "SELECT id, reference, evidence_id, source_reference, description FROM observations WHERE case_id = ?",
      caseId,
    ).map((o) => [o.id, o]),
  );
  const fromEvidence = all<{
    id: string;
    description: string;
    event_datetime: string | null;
    date_text: string | null;
    time_precision: string;
    observation_ids: string;
    evidence_ids: string;
    relationship_note: string | null;
    review_status: string;
    position: number | null;
    created_at: string;
  }>("SELECT * FROM chronology_events WHERE case_id = ? AND superseded = 0", caseId).map(
    (c) => ({
      ...c,
      origin: "evidence" as const,
      activity_kind: null as string | null,
      added_by_name: null as string | null,
      sources: parseJson<string[]>(c.observation_ids, [])
        .map((id) => obs.get(id))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => ({
          observation_id: o.id,
          observation_reference: o.reference,
          evidence_id: o.evidence_id,
          evidence_reference: evRefs.get(o.evidence_id) ?? "?",
          evidence_type: evTypes.get(o.evidence_id) ?? "",
          source_reference: parseJson<SourceReference>(o.source_reference, {} as SourceReference),
          description: o.description,
        })),
    }),
  );
  // Case activity sits in the same chronology: recorded by a person, so treated as reviewed.
  const fromActivity = activityRows(caseId).map((a) => ({
    id: a.id,
    description: a.title,
    event_datetime: a.occurred_at,
    date_text: null,
    time_precision: a.occurred_at ? (a.occurred_at.length > 10 ? "exact" : "day") : "unknown",
    observation_ids: "[]",
    evidence_ids: "[]",
    relationship_note: a.details,
    review_status: "accepted",
    position: a.position,
    created_at: a.created_at,
    origin: "activity" as const,
    activity_kind: a.kind,
    added_by_name: a.added_by_name,
    sources: [] as (typeof fromEvidence)[number]["sources"],
  }));
  // A reviewer's own order first, then date order; undated events last.
  const key = (e: { position: number | null; event_datetime: string | null; created_at: string }) => [e.position ?? Number.MAX_SAFE_INTEGER, e.event_datetime ? 0 : 1, e.event_datetime ?? "", e.created_at] as const;
  return [...fromEvidence, ...fromActivity].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]) || a[3].localeCompare(b[3]);
  });
}
