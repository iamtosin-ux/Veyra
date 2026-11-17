import { all, get, parseJson } from "../db";
import { caseCounts, deriveCaseStatus } from "../cases";
import { formatWhen } from "../casepack";
import { listChronology } from "../findings";
import { CASE_STATUS_LABEL, FINDING_TYPE_LABEL, OBSERVATION_TYPE_LABEL, formatCitation, type EventTime, type FindingType, type ObservationType, type SourceReference } from "@/lib/types";

// Case data the assistant can read. Everything here is a lookup over stored,
// validated records; nothing is generated.

export function evidenceList(caseId: string) {
  return all<{ id: string; reference: string; original_filename: string; evidence_type: string; processing_status: string; n: number }>(
    `SELECT e.id, e.reference, e.original_filename, e.evidence_type, e.processing_status,
            (SELECT COUNT(*) FROM observations o WHERE o.evidence_id = e.id AND o.superseded = 0) n
       FROM evidence e WHERE e.case_id = ? ORDER BY e.reference`,
    caseId,
  ).map((e) => ({ reference: e.reference, filename: e.original_filename, type: e.evidence_type, status: e.processing_status, observations: Number(e.n) }));
}

interface ObsRow {
  reference: string;
  observation_type: ObservationType;
  description: string;
  quote: string | null;
  source_reference: string;
  event_time: string | null;
  evidence_reference: string;
}

const STOP = new Set("the a an of to in on at and or is was were be been it this that what when who how did does do any there with for from about by as are i me my we our you your".split(" "));

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Keyword search over observations (description, quote, stated time). `approvedOnly` limits it to evidence approved for analysis. */
export function searchObservations(caseId: string, query: string, limit = 8, approvedOnly = false) {
  const q = tokens(query);
  const rows = all<ObsRow>(
    `SELECT o.reference, o.observation_type, o.description, o.quote, o.source_reference, o.event_time, e.reference evidence_reference
       FROM observations o JOIN evidence e ON e.id = o.evidence_id
      WHERE o.case_id = ? AND o.superseded = 0 AND (? = 0 OR e.compliance_status = 'APPROVED')`,
    caseId,
    approvedOnly ? 1 : 0,
  );
  const scored = rows
    .map((o) => {
      const et = parseJson<EventTime | null>(o.event_time, null);
      const hay = tokens(`${o.description} ${o.quote ?? ""} ${et?.stated_text ?? ""} ${o.evidence_reference}`);
      const set = new Set(hay);
      const score = q.reduce((n, t) => n + (set.has(t) ? 2 : hay.some((h) => h.startsWith(t) || t.startsWith(h)) ? 1 : 0), 0);
      return { o, et, score };
    })
    .filter((x) => q.length === 0 || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ o, et }) => ({
    reference: o.reference,
    evidence: o.evidence_reference,
    type: OBSERVATION_TYPE_LABEL[o.observation_type],
    description: o.description,
    quote: o.quote,
    citation: formatCitation(o.evidence_reference, parseJson<SourceReference>(o.source_reference, {} as SourceReference)),
    stated_time: et?.stated_text ?? null,
  }));
}

export function findingsList(caseId: string, filter: { type?: FindingType; status?: string } = {}) {
  const rows = all<{ id: string; reference: string; title: string; description: string; finding_type: FindingType; review_status: string; uncertainty: string }>(
    "SELECT id, reference, title, description, finding_type, review_status, uncertainty FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL ORDER BY reference",
    caseId,
  ).filter((f) => (!filter.type || f.finding_type === filter.type) && (!filter.status || f.review_status === filter.status));
  return rows.map((f) => ({
    reference: f.reference,
    type: FINDING_TYPE_LABEL[f.finding_type],
    finding_type: f.finding_type,
    title: f.title,
    description: f.description,
    review_status: f.review_status,
    limitations: parseJson<{ reason?: string | null }>(f.uncertainty, {}).reason ?? null,
    sources: all<{ reference: string }>(
      "SELECT o.reference FROM finding_sources fs JOIN observations o ON o.id = fs.observation_id WHERE fs.finding_id = ? ORDER BY o.reference",
      f.id,
    ).map((r) => r.reference),
  }));
}

/** The chronology as the case presents it: events from evidence and case activity, in the case's order. */
export function timelineList(caseId: string) {
  return listChronology(caseId)
    .filter((c) => c.review_status !== "rejected")
    .map((c) => ({
      when: c.event_datetime ? formatWhen(c.event_datetime) : c.date_text ?? "Undated",
      precision: c.time_precision,
      description: c.description,
      kind: c.origin === "activity" ? "case activity" : "from evidence",
      note: c.relationship_note,
      review_status: c.review_status,
      sources: c.sources.map((x) => x.observation_reference),
    }));
}

export function caseOverview(caseId: string) {
  const c = get<{ reference: string; title: string; description: string; is_demo: number; industry: string | null }>(
    "SELECT reference, title, description, is_demo, industry FROM cases WHERE id = ?",
    caseId,
  );
  const counts = caseCounts(caseId);
  return {
    reference: c?.reference,
    title: c?.title,
    description: c?.description,
    demo: !!c?.is_demo,
    status: CASE_STATUS_LABEL[deriveCaseStatus(counts)],
    evidence_items: counts.evidence,
    findings: counts.activeFindings,
    findings_awaiting_review: counts.unreviewedFindings,
    analysis_running: counts.activeJobs > 0,
  };
}

// ---------------------------------------------------------------------------
// Reference checking: assistant text may only cite references that exist.

export interface ResolvedRef {
  ref: string;
  kind: "observation" | "finding" | "evidence";
  id: string;
  evidence_id?: string;
  evidence_type?: string;
  source_reference?: SourceReference;
  label: string;
}

const REF_RE = /\b(OBS|FND|EVD)-\d{3,}\b/g;

export function resolveRefs(caseId: string, text: string): { text: string; refs: ResolvedRef[]; unknown: string[] } {
  const refs = new Map<string, ResolvedRef>();
  const unknown = new Set<string>();
  for (const m of text.matchAll(REF_RE)) {
    const r = m[0];
    if (refs.has(r) || unknown.has(r)) continue;
    const resolved = resolveOne(caseId, r);
    if (resolved) refs.set(r, resolved);
    else unknown.add(r);
  }
  let out = text;
  for (const u of unknown) out = out.replaceAll(u, `${u} [unverified reference]`);
  return { text: out, refs: [...refs.values()], unknown: [...unknown] };
}

function resolveOne(caseId: string, r: string): ResolvedRef | null {
  if (r.startsWith("OBS")) {
    const o = get<{ id: string; evidence_id: string; source_reference: string; description: string; evidence_type: string; evidence_reference: string }>(
      `SELECT o.id, o.evidence_id, o.source_reference, o.description, e.evidence_type, e.reference evidence_reference
         FROM observations o JOIN evidence e ON e.id = o.evidence_id WHERE o.case_id = ? AND o.reference = ?`,
      caseId,
      r,
    );
    if (!o) return null;
    const sr = parseJson<SourceReference>(o.source_reference, {} as SourceReference);
    return { ref: r, kind: "observation", id: o.id, evidence_id: o.evidence_id, evidence_type: o.evidence_type, source_reference: sr, label: formatCitation(o.evidence_reference, sr) };
  }
  if (r.startsWith("FND")) {
    const f = get<{ id: string; title: string }>("SELECT id, title FROM findings WHERE case_id = ? AND reference = ?", caseId, r);
    return f ? { ref: r, kind: "finding", id: f.id, label: f.title } : null;
  }
  const e = get<{ id: string; original_filename: string; evidence_type: string }>("SELECT id, original_filename, evidence_type FROM evidence WHERE case_id = ? AND reference = ?", caseId, r);
  return e ? { ref: r, kind: "evidence", id: e.id, evidence_id: e.id, evidence_type: e.evidence_type, label: e.original_filename } : null;
}
