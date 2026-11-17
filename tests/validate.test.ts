import { describe, expect, it } from "vitest";
import {
  quoteAppearsIn,
  validateChronologyEntry,
  validateFinding,
  validateObservation,
  type KnownObservation,
  type ValidationContext,
} from "@/server/analysis/validate";
import type { AiObservation } from "@/server/ai/schemas";
import type { SourceReference } from "@/lib/types";

const obs = (o: Partial<AiObservation>): AiObservation => ({
  observation_type: "direct_observation",
  description: "A person enters the room.",
  quote: null,
  start_time_seconds: null,
  end_time_seconds: null,
  frame_times: [],
  transcript_segment_ids: [],
  page_number: null,
  image_region: null,
  event_time: null,
  speaker_label: null,
  requires_review: false,
  uncertainty_reason: null,
  ...o,
});

const videoCtx: ValidationContext = {
  evidenceType: "video",
  durationSeconds: 60,
  sampledFrameTimes: [0.5, 10.5, 14.3, 20.5, 42.1],
  transcript: [
    { id: "S1", start_seconds: 30, end_seconds: 34, text: "It happened earlier, around two o'clock." },
    { id: "S2", start_seconds: 34, end_seconds: 37, text: "I heard a loud bang." },
  ],
  pages: null,
  paginated: false,
  unverifiablePages: [],
};

const pdfCtx: ValidationContext = {
  evidenceType: "document",
  durationSeconds: null,
  sampledFrameTimes: [],
  transcript: null,
  pages: [
    { page_number: 1, text: "Incident report.\nThe tenant reported the incident at approximately 14:00 on 14 March 2026." },
    { page_number: 2, text: "Repairs were requested on 2 February 2026." },
  ],
  paginated: true,
  unverifiablePages: [],
};

describe("quote matching", () => {
  it("ignores case, punctuation and curly quotes", () => {
    expect(quoteAppearsIn("it happened EARLIER — around two o’clock", "It happened earlier, around two o'clock.")).toBe(true);
  });
  it("supports ellipses as ordered gaps", () => {
    expect(quoteAppearsIn("The tenant reported … 14:00", pdfCtx.pages![0].text)).toBe(true);
    expect(quoteAppearsIn("14:00 … The tenant reported", pdfCtx.pages![0].text)).toBe(false);
  });
  it("rejects invented wording", () => {
    expect(quoteAppearsIn("the tenant admitted fault", pdfCtx.pages![0].text)).toBe(false);
  });
});

describe("video observations", () => {
  it("accepts a visual claim backed by inspected frames within its range", () => {
    const r = validateObservation(obs({ start_time_seconds: 14, end_time_seconds: 21, frame_times: [14.3, 20.5] }), videoCtx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.frame_times).toEqual([14.3, 20.5]);
  });

  it("rejects a visual claim citing frames that were never sampled", () => {
    const r = validateObservation(obs({ start_time_seconds: 50, end_time_seconds: 52, frame_times: [51] }), videoCtx);
    expect(r).toMatchObject({ ok: false });
  });

  it("accepts an audible event backed by acoustic analysis instead of frames", () => {
    const ctx = { ...videoCtx, acousticEvents: [{ start_seconds: 42, end_seconds: 42.4 }] };
    const r = validateObservation(obs({ description: "A sudden loud sound is audible.", start_time_seconds: 42, end_time_seconds: 42.4 }), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.precision_note).toMatch(/audio level/);
    // ...but not at a moment with no detected sound and no inspected frame.
    expect(validateObservation(obs({ start_time_seconds: 50, end_time_seconds: 51 }), ctx)).toMatchObject({ ok: false });
  });

  it("rejects timestamps beyond the media duration", () => {
    const r = validateObservation(obs({ observation_type: "ai_inference", start_time_seconds: 75 }), videoCtx);
    expect(r).toMatchObject({ ok: false });
  });

  it("takes statement timing from the transcript, not the model", () => {
    const r = validateObservation(
      obs({ observation_type: "contributor_statement", description: "Speaker says it happened earlier.", quote: "it happened earlier", start_time_seconds: 5, end_time_seconds: 6 }),
      videoCtx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source_reference.start_time_seconds).toBe(30);
      expect(r.value.source_reference.end_time_seconds).toBe(34);
      expect(r.value.transcript_segment_ids).toContain("S1");
    }
  });

  it("rejects a statement whose quote is not in the transcript", () => {
    const r = validateObservation(obs({ observation_type: "contributor_statement", quote: "I saw him do it", start_time_seconds: 30 }), videoCtx);
    expect(r).toMatchObject({ ok: false });
  });

  it("matches quotes spanning two transcript segments", () => {
    const r = validateObservation(
      obs({ observation_type: "contributor_statement", quote: "around two o'clock. I heard a loud bang" }),
      videoCtx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.end_time_seconds).toBe(37);
  });
});

describe("document observations", () => {
  it("accepts a fact with a quote on the cited page", () => {
    const r = validateObservation(
      obs({ observation_type: "extracted_document_fact", quote: "approximately 14:00 on 14 March 2026", page_number: 1 }),
      pdfCtx,
    );
    expect(r).toMatchObject({ ok: true });
  });

  it("corrects the page when the quote is on a different page", () => {
    const r = validateObservation(obs({ observation_type: "extracted_document_fact", quote: "Repairs were requested", page_number: 1 }), pdfCtx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.page_number).toBe(2);
  });

  it("rejects non-existent pages", () => {
    expect(validateObservation(obs({ observation_type: "ai_inference", page_number: 9 }), pdfCtx)).toMatchObject({ ok: false });
  });

  it("rejects a document fact with an invented passage", () => {
    const r = validateObservation(obs({ observation_type: "extracted_document_fact", quote: "the landlord was notified on 1 March", page_number: 1 }), pdfCtx);
    expect(r).toMatchObject({ ok: false });
  });

  it("drops page numbers for unpaginated text", () => {
    const r = validateObservation(obs({ observation_type: "contributor_statement", quote: "Repairs were requested", page_number: 3 }), {
      ...pdfCtx,
      paginated: false,
      pages: [{ page_number: 1, text: "Repairs were requested on 2 February." }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.page_number).toBeNull();
  });

  it("marks quotes from scanned pages as approximate rather than exact", () => {
    const r = validateObservation(obs({ observation_type: "extracted_document_fact", quote: "Signed J. Doe", page_number: 2 }), {
      ...pdfCtx,
      unverifiablePages: [2],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source_reference.precision).toBe("approximate");
      expect(r.value.requires_review).toBe(true);
    }
  });
});

describe("image observations", () => {
  const imgCtx: ValidationContext = { ...pdfCtx, evidenceType: "image", pages: null, paginated: false };
  it("keeps in-bounds regions but labels them approximate", () => {
    const r = validateObservation(obs({ image_region: { x: 100, y: 200, width: 300, height: 100 } }), imgCtx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.precision).toBe("approximate");
  });
  it("drops out-of-bounds regions", () => {
    const r = validateObservation(obs({ image_region: { x: 900, y: 0, width: 300, height: 100 } }), imgCtx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_reference.image_region).toBeNull();
  });
});

describe("case-level validation", () => {
  const ref = {} as SourceReference;
  const known = new Map<string, KnownObservation>([
    ["OBS-001", { id: "a", reference: "OBS-001", evidence_id: "e1", source_reference: ref, event_time: { stated_text: "approximately 14:00 on 14 March 2026", iso_datetime: "2026-03-14T14:00", precision: "approximate", basis: "stated" } }],
    ["OBS-002", { id: "b", reference: "OBS-002", evidence_id: "e2", source_reference: ref, event_time: { stated_text: "2026-03-14 15:30:12", iso_datetime: "2026-03-14T15:30:12", precision: "exact", basis: "overlay" } }],
    ["OBS-003", { id: "c", reference: "OBS-003", evidence_id: "e2", source_reference: ref, event_time: null }],
  ]);
  const base = { title: "Time discrepancy", description: "d", requires_review: false, limitations: "Clock not verified." };

  it("rejects findings that cite only unknown observations (invented identifiers)", () => {
    expect(validateFinding({ ...base, finding_type: "potential_discrepancy", observation_refs: ["OBS-999"] }, known)).toMatchObject({ ok: false });
  });

  it("removes invalid citations but keeps valid ones, flagging the finding", () => {
    const r = validateFinding({ ...base, finding_type: "potential_discrepancy", observation_refs: ["OBS-001", "OBS-002", "EVD-777"] }, known);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sources.map((s) => s.reference)).toEqual(["OBS-001", "OBS-002"]);
      expect(r.requires_review).toBe(true);
    }
  });

  it("flags cross-evidence findings supported by only one item", () => {
    const r = validateFinding({ ...base, finding_type: "supporting_relationship", observation_refs: ["OBS-002", "OBS-003"] }, known);
    expect(r.ok && r.requires_review).toBe(true);
  });

  it("never lets the chronology manufacture a date not stated in its sources", () => {
    const r = validateChronologyEntry({ iso_datetime: "2026-03-15T09:00", date_text: null, precision: "exact", observation_refs: ["OBS-003"] }, known);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.iso_datetime).toBeNull();
      expect(r.precision).toBe("unknown");
    }
  });

  it("keeps a date that a cited observation states", () => {
    const r = validateChronologyEntry({ iso_datetime: "2026-03-14T14:00", date_text: "approximately 14:00", precision: "approximate", observation_refs: ["OBS-001"] }, known);
    expect(r.ok && r.iso_datetime).toBe("2026-03-14T14:00");
  });
});
