import { all, get, parseJson } from "../db";
import { caseIntegrity } from "./integrity";

// Case validity review: checks a case record for problems that could
// undermine it if relied on (integrity, traceability, unresolved conflicts,
// review gaps). It reports issues for a person to resolve; it does not judge
// the merits of the case.

export type Severity = "critical" | "major" | "minor";

export interface ReviewIssue {
  severity: Severity;
  code: string;
  title: string;
  detail: string;
  refs: string[];
}

export interface CaseReviewReport {
  issues: ReviewIssue[];
  checks: string[];
  summary: { critical: number; major: number; minor: number };
}

export function reviewCase(caseId: string): CaseReviewReport {
  const issues: ReviewIssue[] = [];
  const add = (severity: Severity, code: string, title: string, detail: string, refs: string[] = []) => issues.push({ severity, code, title, detail, refs });

  const evidence = all<{ id: string; reference: string; original_filename: string; processing_status: string; duplicate_of: string | null; metadata: string; evidence_type: string }>(
    "SELECT id, reference, original_filename, processing_status, duplicate_of, metadata, evidence_type FROM evidence WHERE case_id = ? ORDER BY reference",
    caseId,
  );
  const integrity = caseIntegrity(caseId);

  // 1. Integrity and provenance
  for (const e of evidence) {
    const r = integrity.get(e.id);
    if (!r) {
      add("major", "integrity_not_checked", `${e.original_filename} has not been integrity-checked`, "Run an integrity check before relying on this item.", [e.reference]);
      continue;
    }
    for (const i of r.indicators) {
      if (i.level === "critical") add("critical", i.code, `${e.original_filename}: ${i.title}`, i.detail, [e.reference]);
      else if (i.level === "strong") add("critical", i.code, `${e.original_filename}: ${i.title}`, `${i.detail} If this item is relied on, its authenticity must be established independently.`, [e.reference]);
      else if (i.level === "indicator") add("major", i.code, `${e.original_filename}: ${i.title}`, i.detail, [e.reference]);
    }
  }

  // 2. Processing completeness
  for (const e of evidence) {
    if (e.processing_status === "failed") add("major", "processing_failed", `${e.original_filename} failed processing`, "Its content is not represented in the findings.", [e.reference]);
    else if (e.processing_status !== "processed") add("major", "not_processed", `${e.original_filename} has not been analysed`, "Findings may be incomplete without it.", [e.reference]);
    if (e.duplicate_of) add("minor", "duplicate", `${e.original_filename} duplicates another upload`, "The same file appears twice; make sure it is not counted as independent support.", [e.reference]);
  }
  if (evidence.length === 0) add("critical", "no_evidence", "The case has no evidence", "There is nothing to support any finding.");

  // 3. Traceability of findings
  const findings = all<{ id: string; reference: string; title: string; finding_type: string; review_status: string }>(
    "SELECT id, reference, title, finding_type, review_status FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL",
    caseId,
  );
  for (const f of findings) {
    const src = all<{ superseded: number; evidence_id: string; reference: string }>(
      "SELECT o.superseded, o.evidence_id, o.reference FROM finding_sources fs JOIN observations o ON o.id = fs.observation_id WHERE fs.finding_id = ?",
      f.id,
    );
    if (src.length === 0) add("critical", "unsupported_finding", `${f.reference} has no supporting source`, `“${f.title}” cannot be traced to evidence.`, [f.reference]);
    if (src.some((s) => s.superseded)) add("major", "stale_sources", `${f.reference} relies on superseded observations`, "The evidence was re-analysed after this finding was made; re-run the comparison or re-check the finding.", [f.reference]);
    const items = new Set(src.map((s) => s.evidence_id)).size;
    if (["supporting_relationship", "potential_discrepancy", "chronological_relationship"].includes(f.finding_type) && items < 2) {
      add("minor", "single_source_relationship", `${f.reference} links evidence but cites one item`, "A cross-evidence claim supported by a single item is weak.", [f.reference]);
    }
    for (const s of src) {
      const r = integrity.get(s.evidence_id);
      if (r && (r.level === "strong" || r.level === "critical") && f.review_status !== "rejected") {
        add("critical", "relies_on_questioned_item", `${f.reference} relies on an item with integrity concerns`, `“${f.title}” cites ${s.reference}, whose source file has strong integrity indicators.`, [f.reference, s.reference]);
        break;
      }
    }
  }

  // 4. Unresolved conflicts and review gaps
  const openDiscrepancies = findings.filter((f) => f.finding_type === "potential_discrepancy" && f.review_status === "unreviewed");
  if (openDiscrepancies.length) {
    add("major", "unresolved_discrepancies", `${openDiscrepancies.length} potential discrepanc${openDiscrepancies.length === 1 ? "y is" : "ies are"} unresolved`, "Conflicting accounts or records have not been reviewed and explained.", openDiscrepancies.map((f) => f.reference));
  }
  const unreviewed = findings.filter((f) => f.review_status === "unreviewed");
  if (unreviewed.length) add("major", "unreviewed_findings", `${unreviewed.length} finding(s) have not been reviewed`, "Unreviewed findings are AI or demo drafts and should not be relied on until checked.", unreviewed.map((f) => f.reference));
  if (findings.length === 0 && evidence.length > 0) add("major", "no_findings", "No cross-evidence findings", "The evidence has not been compared, so conflicts may be undetected.");

  // 5. Chronology
  const undated = Number(get<{ n: number }>("SELECT COUNT(*) n FROM chronology_events WHERE case_id = ? AND superseded = 0 AND event_datetime IS NULL AND date_text IS NULL", caseId)?.n ?? 0);
  if (undated) add("minor", "undated_events", `${undated} event(s) cannot be dated`, "Their place in the sequence of events is uncertain.");

  // 6. Unsupported AI claims caught by validation
  const rejected = Number(
    get<{ n: number }>("SELECT COUNT(*) n FROM validation_rejections v JOIN analysis_runs r ON r.id = v.analysis_run_id WHERE r.case_id = ?", caseId)?.n ?? 0,
  );
  if (rejected) add("minor", "rejected_ai_claims", `${rejected} AI claim(s) were removed by citation validation`, "They were excluded automatically; review the analysis log if the model may have misread the evidence.");

  // 7. Chain of custody
  for (const e of evidence) {
    const m = parseJson<{ upload_source?: string; contributor_name?: string | null }>(e.metadata, {});
    if (m.upload_source === "chat") add("minor", "reviewer_note", `${e.original_filename} is a reviewer note`, "It records what a reviewer was told; it is not primary evidence.", [e.reference]);
  }

  const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    issues,
    checks: [
      "Integrity and provenance indicators for every item",
      "Evidence processing completeness and duplicates",
      "Every finding traceable to current, valid sources",
      "Findings relying on items with integrity concerns",
      "Unresolved discrepancies and unreviewed findings",
      "Undated events in the chronology",
      "AI claims rejected by citation validation",
      "Chain of custody for contributed material",
    ],
    summary: {
      critical: issues.filter((i) => i.severity === "critical").length,
      major: issues.filter((i) => i.severity === "major").length,
      minor: issues.filter((i) => i.severity === "minor").length,
    },
  };
}
