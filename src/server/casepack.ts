import crypto from "node:crypto";
import { approvedWebSources } from "./websources";
import { readOriginal } from "./storage";
import { all, get, now, parseJson, run } from "./db";
import { HttpError, type User } from "./auth";
import { caseSummary, getCaseForUser } from "./cases";
import { listEvidence } from "./evidence";
import { listChronology, listFindings } from "./findings";
import { CASE_STATUS_LABEL, FINDING_TYPE_LABEL, formatCitation, type FindingType, type ReviewStatus } from "@/lib/types";

// The case pack is assembled deterministically from reviewed records. No AI
// call happens here, so the pack can only contain what a reviewer has seen.

export interface PackFinding {
  id: string;
  reference: string;
  title: string;
  description: string;
  finding_type: FindingType;
  type_label: string;
  review_status: ReviewStatus;
  status_label: string;
  relationship_explanation: string | null;
  limitations: string | null;
  citations: string[];
  /** Published judgments a reviewer linked to this finding. */
  precedents?: { citation: string | null; title: string; court: string | null; date: string | null; url: string }[];
}

export interface PackEvent {
  description: string;
  when: string;
  precision: string;
  status_label: string;
  citations: string[];
  note: string | null;
}

export interface CasePackContent {
  case_reference: string;
  title: string;
  description: string;
  generated_at: string;
  generated_by: string;
  version: number;
  draft_status: string;
  include_unreviewed: boolean;
  overview: { evidence_items: number; findings_included: number; findings_excluded_rejected: number; findings_unreviewed: number; case_status: string };
  evidence_inventory: { reference: string; filename: string; type: string; size_bytes: number; uploaded_at: string; hash: string; duplicate_of: string | null }[];
  reviewed_findings: PackFinding[];
  cross_evidence: PackFinding[];
  discrepancies: PackFinding[];
  open_questions: PackFinding[];
  chronology: PackEvent[];
  undated_events: PackEvent[];
  source_references: { observation: string; citation: string; description: string; quote: string | null }[];
  reviewer_notes: { reference: string; text: string; added_at: string; author: string | null; analysed: boolean }[];
  /** Approved web material, kept separate from evidence and always labelled as such. */
  web_sources?: { section: string; title: string; url: string; excerpt: string; relevance: string; origin: "link" | "search"; retrieved_at: string; approved_by: string | null }[];
  notice: string;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  accepted: "Accepted by reviewer",
  corrected: "Corrected by reviewer",
  unreviewed: "UNREVIEWED AI DRAFT",
  rejected: "Rejected",
};

/** Information the reviewer typed into the conversation, stored as written-account evidence. */
function reviewerNotes(caseId: string): CasePackContent["reviewer_notes"] {
  return all<{ reference: string; storage_reference: string; uploaded_at: string; metadata: string; processing_status: string }>(
    "SELECT reference, storage_reference, uploaded_at, metadata, processing_status FROM evidence WHERE case_id = ? AND evidence_type = 'written_account' ORDER BY reference",
    caseId,
  )
    .filter((e) => parseJson<{ upload_source?: string }>(e.metadata, {}).upload_source === "chat")
    .map((e) => {
      let text = "";
      try {
        text = readOriginal(e.storage_reference).toString("utf8");
      } catch {
        text = "(note unavailable)";
      }
      return { reference: e.reference, text, added_at: e.uploaded_at, author: parseJson<{ stated_author?: string | null }>(e.metadata, {}).stated_author ?? null, analysed: e.processing_status === "processed" };
    });
}

export function generateCasePack(user: User, caseId: string, includeUnreviewed: boolean) {
  const { content, snapshotMap } = buildCasePackContent(user, caseId, includeUnreviewed);
  const id = crypto.randomUUID();
  run(
    "INSERT INTO case_packs (id, case_id, version, content, include_unreviewed, finding_snapshot, generated_by, generated_at, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    caseId,
    content.version,
    JSON.stringify(content),
    includeUnreviewed ? 1 : 0,
    JSON.stringify(snapshotMap),
    user.id,
    content.generated_at,
    includeUnreviewed ? "draft" : "reviewed",
  );
  return getCasePack(user, caseId, id);
}

/**
 * The live draft of the pack. Versions are saved automatically: whenever the
 * content differs from the latest saved version, a new version is stored.
 */
export function previewCasePack(user: User, caseId: string) {
  const { content, snapshotMap } = buildCasePackContent(user, caseId, true);
  const latest = get<{ version: number; content: string; generated_at: string }>(
    "SELECT version, content, generated_at FROM case_packs WHERE case_id = ? ORDER BY version DESC LIMIT 1",
    caseId,
  );
  const comparable = (c: CasePackContent) => JSON.stringify({ ...c, generated_at: null, generated_by: null, version: null });
  let saved = latest ? { version: latest.version, generated_at: latest.generated_at } : null;
  if (!latest || comparable(parseJson<CasePackContent>(latest.content, content)) !== comparable(content)) {
    run(
      "INSERT INTO case_packs (id, case_id, version, content, include_unreviewed, finding_snapshot, generated_by, generated_at, review_status) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'draft')",
      crypto.randomUUID(),
      caseId,
      content.version,
      JSON.stringify(content),
      JSON.stringify(snapshotMap),
      user.id,
      content.generated_at,
    );
    saved = { version: content.version, generated_at: content.generated_at };
  }
  return { pack: content, saved };
}

export function buildReviewedOnly(user: User, caseId: string) {
  return buildCasePackContent(user, caseId, false).content;
}

function buildCasePackContent(user: User, caseId: string, includeUnreviewed: boolean) {
  const c = getCaseForUser(user, caseId);
  const summary = caseSummary(c);
  const demo = !!c.is_demo;
  const statusLabel = (s: ReviewStatus) => (s === "unreviewed" && demo ? "UNREVIEWED DEMO DRAFT (hand-written)" : STATUS_LABEL[s]);
  // Restricted evidence isn't considered when building the case: it leaves the inventory,
  // its citations are dropped, and findings or events resting only on it are left out.
  const all_ = listEvidence(caseId);
  const restricted = new Set(all_.filter((e) => e.compliance_status === "RESTRICTED").map((e) => e.id));
  const evidence = all_.filter((e) => !restricted.has(e.id));
  const findings = listFindings(caseId).map((f) => ({ ...f, sources: f.sources.filter((s) => !restricted.has(s.evidence_id)) }));
  const included = findings
    .filter((f) => f.sources.length > 0 || f.finding_type === "missing_information" || f.finding_type === "question")
    .filter((f) => f.review_status === "accepted" || f.review_status === "corrected" || (includeUnreviewed && f.review_status === "unreviewed"));
  const citedObs = new Map<string, { observation: string; citation: string; description: string; quote: string | null }>();

  const toPack = (f: (typeof findings)[number]): PackFinding => {
    const citations = f.sources.map((s) => {
      const citation = formatCitation(s.evidence_reference, s.source_reference);
      citedObs.set(s.observation_reference, { observation: s.observation_reference, citation, description: s.observation_description, quote: s.quote });
      return `${citation} (${s.observation_reference})`;
    });
    return {
      id: f.id,
      reference: f.reference,
      title: f.title,
      description: f.description,
      finding_type: f.finding_type,
      type_label: FINDING_TYPE_LABEL[f.finding_type],
      review_status: f.review_status,
      status_label: statusLabel(f.review_status),
      relationship_explanation: f.relationship_explanation,
      limitations: f.uncertainty.reason,
      citations,
      precedents: f.precedents.map((p) => ({ citation: p.citation, title: p.title, court: p.court, date: p.judgment_date, url: p.url })),
    };
  };

  const packed = included.map(toPack);
  const chronology = listChronology(caseId)
    .map((e) => ({ ...e, sources: e.sources.filter((s) => !restricted.has(s.evidence_id)) }))
    // Evidence events need a source the pack can show; case activity is recorded by a person.
    .filter((e) => e.origin === "activity" || e.sources.length > 0)
    .filter((e) => e.review_status === "accepted" || (includeUnreviewed && e.review_status === "unreviewed"));
  const toEvent = (e: (typeof chronology)[number]): PackEvent => ({
    description: e.description,
    when: e.event_datetime ? formatWhen(e.event_datetime) : e.date_text ?? "Date/time not established",
    precision: e.time_precision,
    status_label: e.origin === "activity" ? `Case activity${e.added_by_name ? `, recorded by ${e.added_by_name}` : ""}` : e.review_status === "accepted" ? "Accepted by reviewer" : demo ? "UNREVIEWED DEMO DRAFT (hand-written)" : "UNREVIEWED AI DRAFT",
    citations: e.sources.map((s) => {
      const citation = formatCitation(s.evidence_reference, s.source_reference);
      citedObs.set(s.observation_reference, { observation: s.observation_reference, citation, description: s.description, quote: null });
      return `${citation} (${s.observation_reference})`;
    }),
    note: e.relationship_note,
  });

  const lastVersion = Number(get<{ v: number }>("SELECT MAX(version) v FROM case_packs WHERE case_id = ?", caseId)?.v ?? 0);
  const content: CasePackContent = {
    case_reference: c.reference,
    title: c.title,
    description: c.description,
    generated_at: now(),
    generated_by: user.name,
    version: lastVersion + 1,
    draft_status: includeUnreviewed
      ? demo
        ? "DRAFT: contains unreviewed hand-written demo material, labelled as such"
        : "DRAFT: contains unreviewed AI-generated material, labelled as such"
      : "Reviewed content only (accepted and corrected findings)",
    include_unreviewed: includeUnreviewed,
    overview: {
      evidence_items: evidence.length,
      findings_included: packed.length,
      findings_excluded_rejected: findings.filter((f) => f.review_status === "rejected").length,
      findings_unreviewed: findings.filter((f) => f.review_status === "unreviewed").length,
      case_status: CASE_STATUS_LABEL[summary.status],
    },
    evidence_inventory: evidence.map((e) => ({
      reference: e.reference,
      filename: e.original_filename,
      type: e.evidence_type,
      size_bytes: e.file_size,
      uploaded_at: e.uploaded_at,
      hash: e.file_hash,
      duplicate_of: e.duplicate_of_reference,
    })),
    reviewed_findings: packed.filter((f) => f.finding_type === "observation"),
    cross_evidence: packed.filter((f) => f.finding_type === "supporting_relationship" || f.finding_type === "chronological_relationship"),
    discrepancies: packed.filter((f) => f.finding_type === "potential_discrepancy"),
    open_questions: packed.filter((f) => f.finding_type === "missing_information" || f.finding_type === "question"),
    chronology: chronology.filter((e) => e.event_datetime || e.date_text).map(toEvent),
    undated_events: chronology.filter((e) => !e.event_datetime && !e.date_text).map(toEvent),
    source_references: [],
    reviewer_notes: reviewerNotes(caseId),
    web_sources: approvedWebSources(caseId).map((w) => ({ section: w.section, title: w.title, url: w.url, excerpt: w.excerpt, relevance: w.relevance, origin: w.origin, retrieved_at: w.retrieved_at, approved_by: w.decided_by_name })),
    notice:
      (demo ? "DEMO CASE: the analysis in this pack was written by hand to demonstrate the workflow and is not AI output. " : "") +
      (restricted.size ? `${restricted.size} restricted evidence item(s) are excluded from this pack. ` : "") +
      "This pack organises evidence and reviewer-checked analysis. Web sources, where included, are outside material approved by a reviewer for context; they are not evidence in the case. It does not establish what occurred and contains no legal advice or determination of liability, guilt or credibility. Accepted entries mean a reviewer has checked them against the cited sources, not that they are independently verified. Generated by a prototype system.",
  };
  content.source_references = [...citedObs.values()].sort((a, b) => a.observation.localeCompare(b.observation));
  const snapshotMap = Object.fromEntries(findings.map((f) => [f.id, { status: f.review_status, version: f.version }]));
  return { content, snapshotMap };
}

/**
 * A pack is stale when any finding it was built from has since been
 * corrected, rejected or otherwise re-reviewed, or new findings appeared.
 */
export function packStaleness(caseId: string, snapshotJson: string): string[] {
  const snap = parseJson<Record<string, { status: string; version: number }>>(snapshotJson, {});
  const current = all<{ id: string; reference: string; review_status: string; version: number; superseded: number; archived: number; reassess_reason: string | null }>(
    "SELECT id, reference, review_status, version, superseded OR archived_at IS NOT NULL superseded, archived_at IS NOT NULL archived, reassess_reason FROM findings WHERE case_id = ?",
    caseId,
  );
  const reasons: string[] = [];
  for (const f of current) {
    const s = snap[f.id];
    if (!s) {
      if (!f.superseded) reasons.push(`${f.reference} is new since this pack was generated`);
    } else if (s.status !== f.review_status || s.version !== f.version) {
      reasons.push(`${f.reference} changed from ${s.status} to ${f.review_status}${s.version !== f.version ? " (content corrected)" : ""}`);
    } else if (f.superseded) reasons.push(f.archived ? `${f.reference} was archived` : `${f.reference} was superseded by re-analysis`);
    if (s && !f.superseded && f.reassess_reason) reasons.push(`${f.reference} needs reassessment: ${f.reassess_reason}`);
  }
  return reasons;
}

export function getCasePack(user: User, caseId: string, packId?: string) {
  getCaseForUser(user, caseId);
  const row = packId
    ? get<{ id: string; content: string; finding_snapshot: string; generated_at: string; version: number }>("SELECT * FROM case_packs WHERE id = ? AND case_id = ?", packId, caseId)
    : get<{ id: string; content: string; finding_snapshot: string; generated_at: string; version: number }>(
        "SELECT * FROM case_packs WHERE case_id = ? ORDER BY version DESC LIMIT 1",
        caseId,
      );
  if (!row) {
    if (packId) throw new HttpError(404, "Case pack not found");
    return null;
  }
  const approval = get<{ approved_at: string | null; name: string | null }>("SELECT p.approved_at, u.name FROM case_packs p LEFT JOIN users u ON u.id = p.approved_by WHERE p.id = ?", row.id);
  return {
    id: row.id,
    content: parseJson<CasePackContent>(row.content, {} as CasePackContent),
    stale_reasons: packStaleness(caseId, row.finding_snapshot),
    approval: approval?.approved_at ? { at: approval.approved_at, by: approval.name } : null,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-05-06T22:15" → "6 May 2026, 22:15" (as stated; no timezone conversion). */
export function formatWhen(iso: string): string {
  const m = iso.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/);
  if (!m) return iso;
  const [, y, mo, d, hh, mm] = m;
  const date = [d ? String(Number(d)) : null, mo ? MONTHS[Number(mo) - 1] : null, y].filter(Boolean).join(" ");
  return hh ? `${date}, ${hh}:${mm}` : date;
}
