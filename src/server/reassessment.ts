import { all, now, parseJson, run } from "./db";

// When something a finding relied on changes (a related finding is rejected
// or corrected, an observation or evidence item is removed, consent is
// withdrawn), dependent findings and timeline events are flagged for a person
// to reassess. Nothing is changed or deleted automatically.

/** Flag live findings and timeline events that cite any of these observations. */
export function flagForObservations(caseId: string, observationIds: string[], reason: string, exceptFindingId?: string): number {
  if (!observationIds.length) return 0;
  const marks = observationIds.map(() => "?").join(",");
  const ids = all<{ id: string }>(
    `SELECT DISTINCT f.id FROM findings f JOIN finding_sources s ON s.finding_id = f.id
      WHERE f.case_id = ? AND f.superseded = 0 AND f.review_status != 'rejected' AND s.observation_id IN (${marks})`,
    caseId,
    ...observationIds,
  )
    .map((r) => r.id)
    .filter((id) => id !== exceptFindingId);
  const ts = now();
  for (const id of ids) run("UPDATE findings SET reassess_reason = ?, reassess_at = ? WHERE id = ?", reason, ts, id);
  const wanted = new Set(observationIds);
  for (const ev of all<{ id: string; observation_ids: string }>("SELECT id, observation_ids FROM chronology_events WHERE case_id = ? AND superseded = 0", caseId)) {
    if (parseJson<string[]>(ev.observation_ids, []).some((o) => wanted.has(o))) run("UPDATE chronology_events SET reassess_reason = ? WHERE id = ?", reason, ev.id);
  }
  return ids.length;
}

/** Everything that cites an evidence item. Call before the item's observations are removed. */
export function flagForEvidence(caseId: string, evidenceId: string, reason: string): number {
  const obs = all<{ id: string }>("SELECT id FROM observations WHERE evidence_id = ?", evidenceId).map((o) => o.id);
  return flagForObservations(caseId, obs, reason);
}

/** A reviewer rejected or corrected a finding: findings resting on the same observations may no longer hold. */
export function flagRelatedToFinding(caseId: string, findingId: string, reference: string, action: "reject" | "correct"): number {
  const obs = all<{ observation_id: string }>("SELECT observation_id FROM finding_sources WHERE finding_id = ?", findingId).map((r) => r.observation_id);
  return flagForObservations(caseId, obs, `${reference} was ${action === "reject" ? "rejected" : "corrected"} by a reviewer and shares sources with this finding. Check whether it still holds.`, findingId);
}

/** A person has looked at the finding again (any review action clears its flag). */
export function clearReassessment(findingId: string) {
  run("UPDATE findings SET reassess_reason = NULL, reassess_at = NULL WHERE id = ?", findingId);
}
