// Domain types shared by server and UI. Kept industry-neutral on purpose:
// legal terminology belongs in presentation, not in the evidence engine.

export type EvidenceType = "video" | "image" | "audio" | "document" | "written_account";
export type ProcessingStatus = "pending" | "queued" | "processing" | "processed" | "failed";

export const OBSERVATION_TYPES = [
  "direct_observation",
  "contributor_statement",
  "extracted_document_fact",
  "ai_inference",
  "potential_discrepancy",
  "unresolved_question",
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export const FINDING_TYPES = [
  "observation",
  "supporting_relationship",
  "potential_discrepancy",
  "chronological_relationship",
  "missing_information",
  "question",
] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const REVIEW_STATUSES = ["unreviewed", "accepted", "corrected", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const TIME_PRECISIONS = ["exact", "minute", "hour", "day", "month", "approximate", "unknown"] as const;
export type TimePrecision = (typeof TIME_PRECISIONS)[number];

export type CaseStatus =
  | "created"
  | "evidence_uploaded"
  | "analysis_in_progress"
  | "ready_for_review"
  | "reviewed"
  | "error";

/** Normalised 0–1000 coordinates relative to the image/frame. */
export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where an observation came from. `precision` tells the UI whether the
 * citation can be shown as exact (validated against extracted content) or
 * only as approximate (e.g. model-estimated image regions).
 */
export interface SourceReference {
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  frame_times: number[];
  page_number: number | null;
  text_span: string | null;
  image_region: ImageRegion | null;
  precision: "exact" | "approximate" | "evidence_only";
  precision_note: string | null;
}

export interface EventTime {
  stated_text: string | null;
  iso_datetime: string | null;
  precision: TimePrecision;
  basis: string | null;
}

export interface Uncertainty {
  requires_review: boolean;
  reason: string | null;
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  created: "Created",
  evidence_uploaded: "Evidence uploaded",
  analysis_in_progress: "Analysis in progress",
  ready_for_review: "Ready for review",
  reviewed: "Reviewed",
  error: "Error / action required",
};

export const OBSERVATION_TYPE_LABEL: Record<ObservationType, string> = {
  direct_observation: "Direct observation",
  contributor_statement: "Contributor statement",
  extracted_document_fact: "Extracted document fact",
  ai_inference: "AI inference",
  potential_discrepancy: "Potential discrepancy",
  unresolved_question: "Unresolved question",
};

export const FINDING_TYPE_LABEL: Record<FindingType, string> = {
  observation: "Observation",
  supporting_relationship: "Supporting relationship",
  potential_discrepancy: "Potential discrepancy",
  chronological_relationship: "Chronological relationship",
  missing_information: "Missing information",
  question: "Question for investigation",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed (AI draft)",
  accepted: "Accepted",
  corrected: "Corrected",
  rejected: "Rejected",
};

export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Unknown";
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Human-readable citation, e.g. "EVD-001 @ 00:14–00:29" or "EVD-003 p.2". */
export function formatCitation(evidenceRef: string, ref: SourceReference): string {
  const parts: string[] = [evidenceRef];
  if (ref.start_time_seconds != null) {
    const end =
      ref.end_time_seconds != null && ref.end_time_seconds !== ref.start_time_seconds
        ? `–${formatTimestamp(ref.end_time_seconds)}`
        : "";
    parts.push(`@ ${formatTimestamp(ref.start_time_seconds)}${end}`);
  }
  if (ref.page_number != null) parts.push(`p.${ref.page_number}`);
  if (ref.image_region) parts.push(ref.precision === "approximate" ? "(approx. region)" : "(region)");
  return parts.join(" ");
}
