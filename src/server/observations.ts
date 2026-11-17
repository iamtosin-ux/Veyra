import { all, parseJson } from "./db";
import type { EventTime, ObservationType, SourceReference } from "@/lib/types";

interface Row {
  id: string;
  case_id: string;
  evidence_id: string;
  analysis_run_id: string;
  reference: string;
  observation_type: ObservationType;
  modality: string;
  description: string;
  quote: string | null;
  source_reference: string;
  event_time: string | null;
  uncertainty: string;
  superseded: number;
  created_at: string;
  evidence_reference: string;
}

export function listObservations(where: { caseId: string } | { evidenceId: string }, includeSuperseded = false) {
  const byCase = "caseId" in where;
  const rows = all<Row>(
    `SELECT o.*, e.reference evidence_reference FROM observations o JOIN evidence e ON e.id = o.evidence_id
      WHERE ${byCase ? "o.case_id" : "o.evidence_id"} = ? ${includeSuperseded ? "" : "AND o.superseded = 0"}
      ORDER BY e.reference, o.reference`,
    byCase ? where.caseId : where.evidenceId,
  );
  const links = all<{ observation_id: string; finding_id: string; reference: string; title: string; review_status: string }>(
    `SELECT fs.observation_id, f.id finding_id, f.reference, f.title, f.review_status FROM finding_sources fs
       JOIN findings f ON f.id = fs.finding_id
       JOIN observations o ON o.id = fs.observation_id
      WHERE ${byCase ? "o.case_id" : "o.evidence_id"} = ? AND f.superseded = 0`,
    byCase ? where.caseId : where.evidenceId,
  );
  return rows.map((o) => ({
    ...o,
    superseded: !!o.superseded,
    source_reference: parseJson<SourceReference & { transcript_segment_ids?: string[] }>(o.source_reference, {} as SourceReference),
    event_time: parseJson<EventTime | null>(o.event_time, null),
    uncertainty: parseJson<{ requires_review: boolean; reason: string | null; speaker_label?: string | null; validation_notes?: string[] }>(o.uncertainty, {
      requires_review: true,
      reason: null,
    }),
    findings: links.filter((l) => l.observation_id === o.id).map(({ observation_id: _o, ...l }) => (void _o, l)),
  }));
}
