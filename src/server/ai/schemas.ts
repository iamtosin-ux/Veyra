import { z } from "zod";
import { FINDING_TYPES, OBSERVATION_TYPES, TIME_PRECISIONS } from "@/lib/types";

// Schemas for model output. Every field is required (nullable where optional)
// so structured outputs stay strict; semantic checks happen in validate.ts.

export const EventTimeSchema = z.object({
  stated_text: z.string().nullable().describe("The time/date wording exactly as it appears in the evidence, if any."),
  iso_datetime: z
    .string()
    .nullable()
    .describe("ISO 8601 date or datetime ONLY if the evidence itself states it. Never infer or complete a date."),
  precision: z.enum(TIME_PRECISIONS),
  basis: z
    .string()
    .nullable()
    .describe("Where the time comes from, e.g. 'stated by author', 'on-screen overlay', 'file metadata (unverified)'."),
});

export const ImageRegionSchema = z.object({
  x: z.number().describe("Left edge, 0-1000 relative to image width"),
  y: z.number().describe("Top edge, 0-1000 relative to image height"),
  width: z.number(),
  height: z.number(),
});

export const AiObservationSchema = z.object({
  observation_type: z.enum(OBSERVATION_TYPES),
  description: z.string().describe("Neutral, specific description. No conclusions about guilt, intent, credibility or identity."),
  quote: z
    .string()
    .nullable()
    .describe("Verbatim text copied exactly from the transcript or document that supports this observation; null for purely visual observations."),
  start_time_seconds: z.number().nullable(),
  end_time_seconds: z.number().nullable(),
  frame_times: z.array(z.number()).describe("For video: the labelled frame timestamps that show this. Empty otherwise."),
  transcript_segment_ids: z.array(z.string()).describe("IDs of transcript segments (e.g. S3) this relies on. Empty if none."),
  page_number: z.number().int().nullable(),
  image_region: ImageRegionSchema.nullable(),
  event_time: EventTimeSchema.nullable().describe("When the described event happened, only if the evidence states it."),
  speaker_label: z
    .string()
    .nullable()
    .describe("Neutral speaker label such as 'Speaker A' or a name only if the speaker states it. Never assert identity."),
  requires_review: z.boolean(),
  uncertainty_reason: z.string().nullable(),
});

export const EvidenceAnalysisSchema = z.object({
  summary: z.string().describe("Two or three neutral sentences describing what this evidence item contains."),
  extraction_issues: z.array(z.string()).describe("Anything unreadable, inaudible, cut off, or otherwise limiting the analysis."),
  observations: z.array(AiObservationSchema),
});
export type EvidenceAnalysis = z.infer<typeof EvidenceAnalysisSchema>;
export type AiObservation = z.infer<typeof AiObservationSchema>;

export const AiFindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  finding_type: z.enum(FINDING_TYPES),
  observation_refs: z.array(z.string()).describe("OBS-### references that support this finding. Use only references listed in the input."),
  relationship_explanation: z
    .string()
    .nullable()
    .describe("For cross-evidence findings: how the cited observations relate, and alternative explanations."),
  limitations: z.string().describe("What is uncertain or not established, e.g. unverified device clocks or unconfirmed identity."),
  requires_review: z.boolean(),
});

export const AiChronologySchema = z.object({
  description: z.string(),
  iso_datetime: z.string().nullable().describe("Only if a cited observation states this date/time. Otherwise null."),
  date_text: z.string().nullable().describe("The time wording as stated in the evidence, e.g. 'around 2pm'."),
  precision: z.enum(TIME_PRECISIONS),
  observation_refs: z.array(z.string()),
  relationship_note: z
    .string()
    .nullable()
    .describe("If accounts of this event differ, note the difference while preserving each account."),
});

export const CaseAnalysisSchema = z.object({
  findings: z.array(AiFindingSchema),
  chronology: z.array(AiChronologySchema),
  coverage_notes: z.array(z.string()).describe("Limits of this analysis, e.g. evidence that could not be compared."),
  case_summary: z
    .string()
    .describe("One or two neutral sentences saying what the evidence in this case concerns (who, where, what is alleged or recorded). No conclusions about what happened, credibility or liability."),
});
export type CaseAnalysis = z.infer<typeof CaseAnalysisSchema>;
