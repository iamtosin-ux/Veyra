import type { EventTime, EvidenceType, FindingType, ImageRegion, SourceReference, TimePrecision } from "@/lib/types";
import type { AiObservation } from "../ai/schemas";

// Citation validation. Model output is checked against what was actually
// extracted from the evidence; anything that cannot be resolved is rejected
// or downgraded to an explicitly approximate citation.

export interface TranscriptSeg {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface ValidationContext {
  evidenceType: EvidenceType;
  durationSeconds: number | null;
  sampledFrameTimes: number[];
  transcript: TranscriptSeg[] | null;
  pages: { page_number: number; text: string }[] | null;
  paginated: boolean;
  /** Pages without a usable text layer (scanned); quotes there cannot be verified. */
  unverifiablePages: number[];
  /** Abrupt sounds found by signal analysis; an audible claim may cite these instead of frames. */
  acousticEvents?: { start_seconds: number; end_seconds: number }[];
}

export interface ValidObservation {
  observation_type: AiObservation["observation_type"];
  description: string;
  quote: string | null;
  source_reference: SourceReference;
  event_time: EventTime | null;
  speaker_label: string | null;
  requires_review: boolean;
  uncertainty_reason: string | null;
  transcript_segment_ids: string[];
}

export type ObservationValidation = { ok: true; value: ValidObservation; notes: string[] } | { ok: false; reason: string };

const FRAME_TOLERANCE = 0.25;
const DURATION_TOLERANCE = 0.5;

export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True if every fragment of the quote (split on ellipses) appears, in order, in the haystack. */
export function quoteAppearsIn(quote: string, haystack: string): boolean {
  const fragments = quote
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map(normaliseForMatch)
    .filter((f) => f.length > 0);
  if (fragments.length === 0) return false;
  const hay = normaliseForMatch(haystack);
  let from = 0;
  for (const f of fragments) {
    const idx = hay.indexOf(f, from);
    if (idx < 0) return false;
    from = idx + f.length;
  }
  return true;
}

/** Find the transcript segments that contain a quote (quotes may span adjacent segments). */
export function locateQuoteInTranscript(quote: string, segments: TranscriptSeg[]): TranscriptSeg[] | null {
  for (let span = 1; span <= 4; span++) {
    for (let i = 0; i + span <= segments.length; i++) {
      const window = segments.slice(i, i + span);
      if (quoteAppearsIn(quote, window.map((s) => s.text).join(" "))) return window;
    }
  }
  return null;
}

function emptyRef(): SourceReference {
  return {
    start_time_seconds: null,
    end_time_seconds: null,
    frame_times: [],
    page_number: null,
    text_span: null,
    image_region: null,
    precision: "exact",
    precision_note: null,
  };
}

export function validateEventTime(et: AiObservation["event_time"]): EventTime | null {
  if (!et) return null;
  let iso = et.iso_datetime;
  if (iso && Number.isNaN(Date.parse(iso.length === 4 ? `${iso}-01-01` : iso.length === 7 ? `${iso}-01` : iso))) iso = null;
  if (!iso && !et.stated_text) return null;
  return { stated_text: et.stated_text, iso_datetime: iso, precision: iso ? et.precision : et.precision, basis: et.basis };
}

function validRegion(r: ImageRegion | null): ImageRegion | null {
  if (!r) return null;
  const vals = [r.x, r.y, r.width, r.height];
  if (vals.some((v) => !Number.isFinite(v))) return null;
  if (r.width <= 0 || r.height <= 0) return null;
  if (r.x < 0 || r.y < 0 || r.x + r.width > 1000.5 || r.y + r.height > 1000.5) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function validateObservation(o: AiObservation, ctx: ValidationContext): ObservationValidation {
  const notes: string[] = [];
  const description = o.description.trim();
  if (!description) return { ok: false, reason: "Empty description" };

  const ref = emptyRef();
  let quote = o.quote?.trim() || null;
  let requiresReview = o.requires_review;
  let uncertainty = o.uncertainty_reason;
  const flag = (reason: string) => {
    requiresReview = true;
    uncertainty = uncertainty ? `${uncertainty} ${reason}` : reason;
  };

  const timed = ctx.evidenceType === "video" || ctx.evidenceType === "audio";
  const segmentIds = new Set((ctx.transcript ?? []).map((s) => s.id));
  const transcriptIds = o.transcript_segment_ids.filter((id) => segmentIds.has(id));
  if (transcriptIds.length < o.transcript_segment_ids.length) notes.push("Dropped unknown transcript segment IDs");

  if (timed) {
    let start = o.start_time_seconds;
    let end = o.end_time_seconds ?? o.start_time_seconds;
    const duration = ctx.durationSeconds ?? Infinity;

    // Spoken content must resolve to the transcript; its timing comes from the transcript, not the model.
    if (quote) {
      const located = ctx.transcript ? locateQuoteInTranscript(quote, ctx.transcript) : null;
      if (located) {
        start = located[0].start_seconds;
        end = located[located.length - 1].end_seconds;
        for (const s of located) if (!transcriptIds.includes(s.id)) transcriptIds.push(s.id);
      } else if (o.observation_type === "contributor_statement") {
        return { ok: false, reason: `Quoted speech not found in transcript: "${quote.slice(0, 120)}"` };
      } else {
        notes.push("Quote not found in transcript; quote removed");
        quote = null;
        flag("Wording attributed to the recording could not be matched to the transcript.");
      }
    } else if (o.observation_type === "contributor_statement") {
      if (transcriptIds.length === 0) return { ok: false, reason: "Statement has neither a verifiable quote nor transcript segment reference" };
      const segs = (ctx.transcript ?? []).filter((s) => transcriptIds.includes(s.id));
      start = Math.min(...segs.map((s) => s.start_seconds));
      end = Math.max(...segs.map((s) => s.end_seconds));
    }

    if (start == null) {
      if (o.observation_type === "unresolved_question" || o.observation_type === "ai_inference") {
        ref.precision = "evidence_only";
        ref.precision_note = "Refers to the recording as a whole.";
      } else {
        return { ok: false, reason: "Timed media observation has no timestamp" };
      }
    } else {
      if (end == null) end = start;
      if (start < 0 || end < start) return { ok: false, reason: `Invalid time range ${start}–${end}` };
      if (start > duration + DURATION_TOLERANCE) return { ok: false, reason: `Timestamp ${start}s is beyond media duration ${duration}s` };
      if (end > duration) end = duration;
      ref.start_time_seconds = round(start);
      ref.end_time_seconds = round(end);
    }

    if (ctx.evidenceType === "video") {
      const inspected = o.frame_times.filter((t) => ctx.sampledFrameTimes.some((f) => Math.abs(f - t) <= FRAME_TOLERANCE));
      if (inspected.length < o.frame_times.length) notes.push("Dropped frame times that were never inspected");
      ref.frame_times = inspected.map(round);
      const isVisualClaim = o.observation_type === "direct_observation" && !quote && transcriptIds.length === 0;
      const s0 = ref.start_time_seconds;
      const e0 = ref.end_time_seconds ?? s0;
      const audible =
        s0 != null && (ctx.acousticEvents ?? []).some((a) => a.end_seconds >= s0 - 0.5 && a.start_seconds <= (e0 ?? s0) + 0.5);
      if (isVisualClaim && audible && inspected.length === 0) {
        ref.precision_note = "Based on audio level analysis; the cause of the sound is not identified.";
      } else if (isVisualClaim) {
        if (inspected.length === 0) return { ok: false, reason: "Visual observation is not backed by any inspected frame" };
        if (ref.start_time_seconds != null) {
          const s = ref.start_time_seconds - 1.5;
          const e = (ref.end_time_seconds ?? ref.start_time_seconds) + 1.5;
          if (!inspected.some((t) => t >= s && t <= e)) {
            return { ok: false, reason: "Cited frames fall outside the observation's time range" };
          }
        }
        ref.precision_note = "Based on sampled frames; movement between frames was not directly observed.";
      }
    }
  } else {
    // Documents, written accounts and images.
    let page = ctx.paginated ? o.page_number : null;
    if (ctx.paginated && page != null) {
      const total = ctx.pages?.length ?? 0;
      if (!Number.isInteger(page) || page < 1 || page > total) return { ok: false, reason: `Page ${page} does not exist (document has ${total})` };
    }
    if (quote && ctx.pages) {
      const unverifiable = page != null && ctx.unverifiablePages.includes(page);
      const candidates = page != null ? ctx.pages.filter((p) => p.page_number === page) : ctx.pages;
      const hit = candidates.find((p) => quoteAppearsIn(quote!, p.text));
      if (hit) {
        if (ctx.paginated) page = hit.page_number;
      } else if (unverifiable || (ctx.unverifiablePages.length > 0 && page == null)) {
        ref.precision = "approximate";
        ref.precision_note = "Read visually from a scanned page; wording not verified against a text layer.";
        flag("Quote read from a scanned page could not be verified automatically.");
      } else if (page != null && ctx.pages.some((p) => quoteAppearsIn(quote!, p.text))) {
        // Quote exists but on a different page: correct the page rather than keep a wrong citation.
        page = ctx.pages.find((p) => quoteAppearsIn(quote!, p.text))!.page_number;
        notes.push("Corrected page number to where the quote appears");
      } else if (o.observation_type === "contributor_statement" || o.observation_type === "extracted_document_fact") {
        return { ok: false, reason: `Quoted passage not found in document text: "${quote.slice(0, 120)}"` };
      } else {
        notes.push("Quote not found in document; quote removed");
        quote = null;
        flag("Cited wording could not be matched to the document text.");
      }
    } else if (quote && ctx.evidenceType === "image") {
      ref.precision = "approximate";
      ref.precision_note = "Text read from the image by the AI model; check against the image.";
    } else if (!quote && (o.observation_type === "contributor_statement" || o.observation_type === "extracted_document_fact") && ctx.pages) {
      return { ok: false, reason: "Document statement/fact has no supporting passage" };
    }
    ref.page_number = page;
    if (ctx.evidenceType === "image") {
      const region = validRegion(o.image_region);
      if (o.image_region && !region) notes.push("Dropped out-of-bounds image region");
      ref.image_region = region;
      ref.precision = "approximate";
      ref.precision_note = region
        ? "Region outlined by the AI model; position is approximate."
        : ref.precision_note ?? "Refers to the image as a whole.";
    }
  }

  ref.text_span = quote;
  return {
    ok: true,
    notes,
    value: {
      observation_type: o.observation_type,
      description,
      quote,
      source_reference: ref,
      event_time: validateEventTime(o.event_time),
      speaker_label: o.speaker_label,
      requires_review: requiresReview,
      uncertainty_reason: uncertainty,
      transcript_segment_ids: transcriptIds,
    },
  };
}

// ---------------------------------------------------------------------------
// Case-level validation

export interface KnownObservation {
  id: string;
  reference: string;
  evidence_id: string;
  source_reference: SourceReference;
  event_time: EventTime | null;
}

const CROSS_TYPES: FindingType[] = ["supporting_relationship", "potential_discrepancy", "chronological_relationship"];

export function resolveObservationRefs(refs: string[], known: Map<string, KnownObservation>) {
  const valid: KnownObservation[] = [];
  const unknown: string[] = [];
  for (const r of new Set(refs.map((x) => x.trim().toUpperCase()))) {
    const k = known.get(r);
    if (k) valid.push(k);
    else unknown.push(r);
  }
  return { valid, unknown };
}

export function validateFinding(
  f: { finding_type: FindingType; observation_refs: string[]; title: string; description: string; requires_review: boolean; limitations: string },
  known: Map<string, KnownObservation>,
):
  | { ok: true; sources: KnownObservation[]; requires_review: boolean; limitations: string; unknownRefs: string[] }
  | { ok: false; reason: string } {
  if (!f.title.trim() || !f.description.trim()) return { ok: false, reason: "Empty finding" };
  const { valid, unknown } = resolveObservationRefs(f.observation_refs, known);
  if (valid.length === 0) {
    return { ok: false, reason: unknown.length ? `Cites only unknown observations: ${unknown.join(", ")}` : "Finding cites no observations" };
  }
  let limitations = f.limitations.trim();
  let requiresReview = f.requires_review;
  if (unknown.length) {
    requiresReview = true;
    limitations += ` [System: ${unknown.length} invalid citation(s) were removed: ${unknown.join(", ")}.]`;
  }
  const evidenceCount = new Set(valid.map((v) => v.evidence_id)).size;
  if (CROSS_TYPES.includes(f.finding_type) && evidenceCount < 2) {
    requiresReview = true;
    limitations += " [System: this relationship is supported by a single evidence item only.]";
  }
  return { ok: true, sources: valid, requires_review: requiresReview, limitations: limitations.trim(), unknownRefs: unknown };
}

export function validateChronologyEntry(
  c: { iso_datetime: string | null; date_text: string | null; precision: TimePrecision; observation_refs: string[] },
  known: Map<string, KnownObservation>,
):
  | { ok: true; sources: KnownObservation[]; iso_datetime: string | null; precision: TimePrecision; note: string | null }
  | { ok: false; reason: string } {
  const { valid } = resolveObservationRefs(c.observation_refs, known);
  if (valid.length === 0) return { ok: false, reason: "Chronology entry cites no valid observations" };
  let iso = c.iso_datetime;
  let precision = c.precision;
  let note: string | null = null;
  if (iso) {
    // A date may only appear if a cited observation states it.
    const stated = valid.map((v) => v.event_time?.iso_datetime).filter((x): x is string => !!x);
    const matches = stated.some((s) => {
      const n = Math.min(s.length, iso!.length, 10);
      return s.slice(0, n) === iso!.slice(0, n);
    });
    if (!matches) {
      iso = null;
      precision = "unknown";
      note = "Date removed: not stated in the cited evidence.";
    } else if (Number.isNaN(Date.parse(iso.length === 4 ? `${iso}-01-01` : iso.length === 7 ? `${iso}-01` : iso))) {
      iso = null;
      precision = "unknown";
      note = "Invalid date removed.";
    }
  }
  if (!iso && precision !== "unknown" && !c.date_text) precision = "unknown";
  return { ok: true, sources: valid, iso_datetime: iso, precision, note };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
