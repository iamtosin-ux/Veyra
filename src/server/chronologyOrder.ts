import { all, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { flagForObservations } from "./reassessment";
import { listChronology } from "./findings";
import { parseStated } from "@/lib/dates";

/**
 * Reordering the chronology by hand. A new order that puts an event before one
 * the evidence dates earlier changes what the case says happened, so it's only
 * saved once the reviewer confirms, and the findings resting on those events
 * are flagged for reassessment.
 */

interface Row {
  id: string;
  description: string;
  event_datetime: string | null;
  date_text: string | null;
  observation_ids: string;
}

export interface OrderConflict {
  earlier: { id: string; description: string; when: string };
  later: { id: string; description: string; when: string };
}

export interface OrderImpact {
  conflicts: OrderConflict[];
  findings: { id: string; reference: string; title: string }[];
}

const when = (r: Row) => r.date_text ?? r.event_datetime ?? "Undated";

/**
 * Pure: pairs of dated events that the new order puts the wrong way round
 * (the one placed first is dated later), counting only pairs that weren't
 * already that way round before.
 */
export function newConflicts<T extends { id: string; t: number | null }>(before: T[], after: T[]): [T, T][] {
  const was = new Map(before.map((e, i) => [e.id, i]));
  const out: [T, T][] = [];
  for (let i = 0; i < after.length; i++) {
    for (let j = i + 1; j < after.length; j++) {
      const a = after[i]!;
      const b = after[j]!;
      if (a.t == null || b.t == null || a.t <= b.t) continue;
      // Already this way round before: accepted earlier, so not raised again.
      if ((was.get(a.id) ?? 0) < (was.get(b.id) ?? 0)) continue;
      out.push([a, b]);
    }
  }
  return out;
}

/** Events and case activity in the case's current order. Rejected events stay out of the ordering. */
function rows(caseId: string): Row[] {
  return listChronology(caseId)
    .filter((e) => e.review_status !== "rejected")
    .map((e) => ({ id: e.id, description: e.description, event_datetime: e.event_datetime, date_text: e.date_text, observation_ids: e.observation_ids }));
}

function impactOf(caseId: string, current: Row[], next: Row[]) {
  const withT = (r: Row) => ({ ...r, t: r.event_datetime ? parseStated(r.event_datetime) : null });
  const pairs = newConflicts(current.map(withT), next.map(withT));
  const involved = new Set(pairs.flatMap(([a, b]) => [a.id, b.id]));
  const obsIds = [...new Set(next.filter((r) => involved.has(r.id)).flatMap((r) => JSON.parse(r.observation_ids || "[]") as string[]))];
  const findings = obsIds.length
    ? all<{ id: string; reference: string; title: string }>(
        `SELECT DISTINCT f.id, f.reference, f.title FROM findings f JOIN finding_sources s ON s.finding_id = f.id
          WHERE f.case_id = ? AND f.superseded = 0 AND f.archived_at IS NULL AND s.observation_id IN (${obsIds.map(() => "?").join(",")}) ORDER BY f.reference`,
        caseId,
        ...obsIds,
      )
    : [];
  return {
    impact: {
      conflicts: pairs.slice(0, 5).map(([a, b]) => ({ earlier: { id: a.id, description: a.description, when: when(a) }, later: { id: b.id, description: b.description, when: when(b) } })),
      findings,
    } satisfies OrderImpact,
    obsIds,
    pairs,
  };
}

/** Save a new order, or report what it would change and wait for confirmation. */
export function reorderChronology(user: User, caseId: string, ids: string[], confirm: boolean): { saved: boolean; impact: OrderImpact } {
  getCaseForUser(user, caseId, "case");
  const current = rows(caseId);
  const byId = new Map(current.map((r) => [r.id, r]));
  if (ids.length !== current.length || ids.some((id) => !byId.has(id)) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, "The order must list each chronology event once");
  }
  const next = ids.map((id) => byId.get(id)!);
  const { impact, obsIds, pairs } = impactOf(caseId, current, next);
  if (pairs.length && !confirm) return { saved: false, impact };

  ids.forEach((id, i) => {
    run("UPDATE chronology_events SET position = ? WHERE id = ? AND case_id = ?", i + 1, id, caseId);
    run("UPDATE case_activities SET position = ? WHERE id = ? AND case_id = ?", i + 1, id, caseId);
  });
  if (pairs.length) {
    const [a, b] = pairs[0]!;
    flagForObservations(
      caseId,
      obsIds,
      `${user.name} reordered the chronology: “${a.description}” (${when(a)}) now comes before “${b.description}” (${when(b)}), which the evidence dates earlier. Check whether this finding still holds.`,
    );
  }
  touchCase(caseId);
  return { saved: true, impact };
}

/** Go back to date order. */
export function resetChronologyOrder(user: User, caseId: string) {
  getCaseForUser(user, caseId, "case");
  run("UPDATE chronology_events SET position = NULL WHERE case_id = ?", caseId);
  run("UPDATE case_activities SET position = NULL WHERE case_id = ?", caseId);
  touchCase(caseId);
}
