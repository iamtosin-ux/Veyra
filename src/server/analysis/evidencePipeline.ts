import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { all, get, now, parseJson, run, tx } from "../db";
import { nextReference, touchCase } from "../cases";
import { getEvidence, type EvidenceRow } from "../evidence";
import { decryptToTemp, derivedDir, hashFile, sealDerived, withOriginalFile } from "../storage";
import { MODEL, callStructured, describeAiError } from "../ai/client";
import { EVIDENCE_SYSTEM_PROMPT } from "../ai/prompts";
import { EvidenceAnalysisSchema, type EvidenceAnalysis } from "../ai/schemas";
import { decodeAudio, detectAcousticEvents, detectSceneChanges, extractFrame, makeStill, planFrameSamples, probe, type AcousticEvent, type MediaProbe } from "../media/ffmpeg";
import { transcribe, type Transcript } from "../media/transcribe";
import { ELEVENLABS_MODEL, elevenLabsConfigured, transcribeWithElevenLabs } from "../media/elevenlabs";
import { extractDocx, extractPdf, extractPlainText, type DocumentExtraction } from "../extract/document";
import { parseDocument, toExtraction } from "../extract/office";
import { validateObservation, type ValidationContext } from "./validate";
import { completeRun, failRun, getRun, recordRejection, saveExtraction, setStage, startRun } from "./runs";
import { formatTimestamp } from "@/lib/types";
import type { Operation, Provider } from "@/lib/compliance";
import { authorise, caseOrganisation, completeAudit, refreshEvidenceCompliance, type Authorisation } from "../compliance/engine";

type Block = Anthropic.Beta.BetaContentBlockParam;

const PIPELINE_VERSION = "evidence-pipeline/1";

export interface Prepared {
  content: Block[];
  ctx: ValidationContext;
  images: number;
  mediaSeconds: number;
  config: Record<string, unknown>;
}

/** The step that turns prepared evidence into observations. Claude in normal use; swappable for demo data. */
export interface EvidenceAnalyser {
  model: string;
  /** The external provider this analyser sends data to, or null when it runs locally. */
  provider: Provider | null;
  analyse: (e: EvidenceRow, prepared: Prepared, runId: string, auth: Authorisation) => Promise<EvidenceAnalysis>;
}

export const claudeEvidenceAnalyser: EvidenceAnalyser = {
  model: MODEL,
  provider: "anthropic",
  analyse: (e, prepared, runId, auth) =>
    callStructured({
      authorisation: auth,
      runId,
      purpose: `evidence:${e.evidence_type}`,
      system: EVIDENCE_SYSTEM_PROMPT,
      content: prepared.content,
      schema: EvidenceAnalysisSchema,
      effort: "high",
      usage: { images: prepared.images, mediaSeconds: prepared.mediaSeconds },
    }),
};

export async function processEvidenceRun(runId: string, heartbeat: () => void, analyser: EvidenceAnalyser = claudeEvidenceAnalyser) {
  const r = getRun(runId);
  if (!r || !r.evidence_id) throw new Error(`Run ${runId} not found`);
  const e = getEvidence(r.evidence_id);
  if (!e) throw new Error("Evidence not found");

  // Compliance first: nothing is extracted or sent anywhere unless the approved policy allows it.
  const auth = authoriseEvidence(e, runId, analyser);

  run("UPDATE evidence SET processing_status = 'processing', processing_error = NULL WHERE id = ?", e.id);
  startRun(runId, analyser.model, { pipeline: PIPELINE_VERSION });
  run("UPDATE analysis_runs SET policy_id = ?, policy_version = ? WHERE id = ?", auth.policyId, auth.policyVersion, runId);
  try {
    // The original is stored encrypted; tools get a temporary decrypted copy for extraction only.
    const prepared = await withOriginalFile(e.storage_reference, async (file) => {
      // Integrity: the original must be byte-identical to what was uploaded.
      if (hashFile(file) !== e.file_hash) throw new Error("Stored original no longer matches its upload hash; refusing to analyse.");
      setStage(runId, "Extracting content");
      return prepare(e, file, runId, heartbeat);
    });
    run("UPDATE analysis_runs SET processing_configuration = ? WHERE id = ?", JSON.stringify({ pipeline: PIPELINE_VERSION, ...prepared.config }), runId);

    setStage(runId, e.evidence_type === "video" || e.evidence_type === "image" ? "Analysing media" : "Generating observations");
    heartbeat();
    const ai = await analyser.analyse(e, prepared, runId, auth);

    setStage(runId, "Validating citations");
    heartbeat();
    saveExtraction(e.id, runId, "ai_summary", { summary: ai.summary, extraction_issues: ai.extraction_issues });
    storeObservations(e, runId, ai.observations, prepared.ctx, { supersedePrevious: true });

    run("UPDATE evidence SET processing_status = 'processed', processing_error = NULL WHERE id = ?", e.id);
    completeRun(runId);
    completeAudit(auth.auditId, "completed", runId);
    touchCase(e.case_id);
  } catch (err) {
    const message = describeAiError(err);
    completeAudit(auth.auditId, "failed", runId);
    failRun(runId, message);
    // Previously accepted observations and the original file are untouched by a failure.
    run("UPDATE evidence SET processing_status = 'failed', processing_error = ? WHERE id = ?", message, e.id);
    touchCase(e.case_id);
    throw err;
  } finally {
    // Frames, stills and audio extracted for this run are encrypted once it's done with them.
    sealDerived(e.id);
  }
}

/** Local extraction steps each evidence type needs before observations are generated. */
export function extractionOperations(type: string): Operation[] {
  if (type === "video") return ["frame_analysis", "transcription"];
  if (type === "audio") return ["transcription"];
  if (type === "image") return ["image_analysis"];
  return ["text_extraction"];
}

/**
 * Authorise every operation this run will perform. On a block the run fails
 * with the policy's explanation, the item goes back to pending, and nothing has
 * been extracted or sent.
 */
function authoriseEvidence(e: EvidenceRow, runId: string, analyser: EvidenceAnalyser): Authorisation {
  const organisationId = caseOrganisation(e.case_id);
  try {
    for (const op of extractionOperations(e.evidence_type)) {
      authorise({ operation: op, provider: null, organisationId, caseId: e.case_id, evidenceId: e.id, user: null });
    }
    return authorise({ operation: "observations", provider: analyser.provider, organisationId, caseId: e.case_id, evidenceId: e.id, user: null, modelVersion: analyser.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failRun(runId, `Blocked by processing policy: ${message}`);
    run("UPDATE evidence SET processing_status = 'pending', processing_error = ? WHERE id = ?", `Blocked by processing policy: ${message}`, e.id);
    refreshEvidenceCompliance(e.id);
    throw err;
  }
}

export function storeObservations(
  e: EvidenceRow,
  runId: string,
  observations: Parameters<typeof validateObservation>[0][],
  ctx: ValidationContext,
  opts: { supersedePrevious: boolean },
) {
  const accepted: string[] = [];
  tx(() => {
    if (opts.supersedePrevious) {
      // Reviewer annotations are kept when an item is re-processed.
      run("UPDATE observations SET superseded = 1 WHERE evidence_id = ? AND analysis_run_id != ? AND modality != 'reviewer'", e.id, runId);
    }
    for (const o of observations) {
      const v = validateObservation(o, ctx);
      if (!v.ok) {
        recordRejection(runId, "observation", v.reason, o);
        continue;
      }
      const id = crypto.randomUUID();
      const ref = nextReference(e.case_id, "observation");
      run(
        `INSERT INTO observations (id, case_id, evidence_id, analysis_run_id, reference, observation_type, modality, description,
           quote, source_reference, event_time, uncertainty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        e.case_id,
        e.id,
        runId,
        ref,
        v.value.observation_type,
        e.evidence_type,
        v.value.description,
        v.value.quote,
        JSON.stringify({ ...v.value.source_reference, transcript_segment_ids: v.value.transcript_segment_ids }),
        v.value.event_time ? JSON.stringify(v.value.event_time) : null,
        JSON.stringify({
          requires_review: v.value.requires_review,
          reason: v.value.uncertainty_reason,
          speaker_label: v.value.speaker_label,
          validation_notes: v.notes,
        }),
        now(),
      );
      accepted.push(ref);
    }
  });
  return accepted;
}

// ---------------------------------------------------------------------------
// Format-specific preparation

function header(e: EvidenceRow, extra: string[]): string {
  return [
    `Evidence reference: ${e.reference}`,
    `Evidence type: ${e.evidence_type}`,
    `Original filename: ${e.original_filename}`,
    `Uploaded to this workspace at: ${e.uploaded_at} (this is the upload time, not the time of any event)`,
    ...extra,
  ].join("\n");
}

function transcriptText(t: Transcript | null): string {
  if (!t) return "No audio track.";
  if (t.segments.length === 0) return `No transcript: ${t.note ?? "no speech detected"}.`;
  return t.segments.map((s) => `[${s.id}] ${s.start_seconds.toFixed(2)}s–${s.end_seconds.toFixed(2)}s: ${s.text}`).join("\n");
}

function acousticText(a: { events: AcousticEvent[]; baseline_dbfs: number } | null): string {
  if (!a) return "Not available.";
  if (a.events.length === 0) return `No abrupt loud sounds detected (median level ${a.baseline_dbfs} dBFS).`;
  return [
    `Median level ${a.baseline_dbfs} dBFS. Abrupt level increases detected by signal analysis (cause not identified):`,
    ...a.events.map((x) => `- ${x.start_seconds.toFixed(2)}s–${x.end_seconds.toFixed(2)}s: peak ${x.peak_dbfs} dBFS, +${x.rise_db} dB above preceding level`),
  ].join("\n");
}

function metadataText(p: MediaProbe): string {
  return [
    `Duration: ${p.duration_seconds?.toFixed(2) ?? "unknown"} seconds`,
    `Container: ${p.container ?? "unknown"}`,
    p.video ? `Video: ${p.video.codec} ${p.video.width}x${p.video.height} @ ${p.video.fps ?? "?"} fps` : "Video stream: none",
    p.audio ? `Audio: ${p.audio.codec} ${p.audio.sample_rate} Hz, ${p.audio.channels} ch` : "Audio stream: none",
    `Container creation_time tag: ${p.container_creation_time ?? "absent"} (device/file metadata — NOT verified; the recording clock may be wrong)`,
  ].join("\n");
}

/** Authorise sending this item's audio to ElevenLabs, or null (audited) when the policy doesn't allow it. */
function externalTranscription(e: EvidenceRow): Authorisation | null {
  try {
    return authorise({ operation: "transcription", provider: "elevenlabs", organisationId: caseOrganisation(e.case_id), caseId: e.case_id, evidenceId: e.id, user: null, modelVersion: ELEVENLABS_MODEL });
  } catch {
    return null;
  }
}

async function analyseAudioTrack(file: string, e: EvidenceRow, runId: string, p: MediaProbe, heartbeat: () => void) {
  if (!p.audio) return { transcript: null, acoustic: null };
  setStage(runId, "Transcribing audio");
  const pcm = await decodeAudio(file);
  heartbeat();
  const acoustic = detectAcousticEvents(pcm);
  saveExtraction(e.id, runId, "acoustic_events", acoustic);
  let transcript: Transcript;
  try {
    // ElevenLabs only when it is configured and the policy approves it; otherwise local Whisper.
    const external = elevenLabsConfigured() ? externalTranscription(e) : null;
    transcript = external ? await transcribeWithElevenLabs(pcm, external) : await transcribe(pcm);
  } catch (err) {
    transcript = { engine: "none", language: null, segments: [], note: `Transcription failed: ${err instanceof Error ? err.message : err}` };
  }
  heartbeat();
  saveExtraction(
    e.id,
    runId,
    "transcript",
    transcript,
    transcript.engine === "none" ? "failed" : transcript.segments.length ? "ok" : "uncertain",
    transcript.note,
  );
  return { transcript, acoustic };
}

async function prepare(e: EvidenceRow, file: string, runId: string, heartbeat: () => void): Promise<Prepared> {
  const baseCtx: ValidationContext = {
    evidenceType: e.evidence_type,
    durationSeconds: null,
    sampledFrameTimes: [],
    transcript: null,
    pages: null,
    paginated: false,
    unverifiablePages: [],
  };

  if (e.evidence_type === "video") {
    const p = await probe(file);
    mergeMetadata(e.id, { technical: p, metadata_note: "Technical metadata read from the file; not verified as evidence of when events occurred." });
    saveExtraction(e.id, runId, "media_probe", p);
    if (!p.video) throw new Error("No video stream found in this file.");
    const duration = p.duration_seconds ?? 0;
    const { transcript, acoustic } = await analyseAudioTrack(file, e, runId, p, heartbeat);

    setStage(runId, "Detecting scenes");
    const scenes = await detectSceneChanges(file).catch(() => [] as number[]);
    heartbeat();
    const times = planFrameSamples(duration, scenes);
    setStage(runId, "Sampling frames");
    const dir = derivedDir(e.id, runId);
    const frames: { id: string; t: number; file: string }[] = [];
    for (const [i, t] of times.entries()) {
      const out = path.join(dir, `frame_${String(i).padStart(3, "0")}.jpg`);
      await extractFrame(file, t, out);
      if (fs.existsSync(out)) frames.push({ id: `F${i + 1}`, t, file: path.relative(path.join(dir, ".."), out) });
    }
    heartbeat();
    saveExtraction(e.id, runId, "frames", { scene_changes: scenes, frames: frames.map((f) => ({ id: f.id, t: f.t, file: f.file })) });

    const content: Block[] = [
      {
        type: "text",
        text: `<evidence>\n${header(e, [metadataText(p)])}\n\n## Transcript (automatic, timestamps in seconds)\n${transcriptText(transcript)}\n\n## Acoustic signal analysis\n${acousticText(acoustic)}\n\n## Frames\nThe following ${frames.length} frames were sampled adaptively across the recording (regular intervals plus scene changes). Each is labelled with its timestamp. Consecutive frames let you reason about movement and change; anything between frames was not seen.`,
      },
    ];
    for (const f of frames) {
      content.push({ type: "text", text: `Frame ${f.id} at t=${f.t.toFixed(2)}s (${formatTimestamp(f.t)})` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(path.join(dir, "..", f.file)).toString("base64") },
      });
    }
    content.push({
      type: "text",
      text: `</evidence>\n\nAnalyse ${e.reference}. Combine visual, spoken and acoustic information, linking them only where the timing supports it, and without assuming causation. Note any on-screen timestamps or overlays as direct observations of what the overlay shows (the overlay clock is not verified). For visual observations list the frame timestamps you relied on.`,
    });
    return {
      content,
      ctx: {
        ...baseCtx,
        durationSeconds: duration,
        sampledFrameTimes: frames.map((f) => f.t),
        transcript: transcript?.segments ?? [],
        acousticEvents: acoustic?.events ?? [],
      },
      images: frames.length,
      mediaSeconds: duration,
      config: { frames_sampled: frames.length, scene_changes: scenes.length, transcription: transcript?.engine ?? null },
    };
  }

  if (e.evidence_type === "audio") {
    const p = await probe(file);
    mergeMetadata(e.id, { technical: p, metadata_note: "Technical metadata read from the file; not verified." });
    saveExtraction(e.id, runId, "media_probe", p);
    const { transcript, acoustic } = await analyseAudioTrack(file, e, runId, p, heartbeat);
    if (!transcript) throw new Error("No audio stream found in this file.");
    return {
      content: [
        {
          type: "text",
          text: `<evidence>\n${header(e, [metadataText(p)])}\n\n## Transcript (automatic, timestamps in seconds)\n${transcriptText(transcript)}\n\n## Acoustic signal analysis\n${acousticText(acoustic)}\n</evidence>\n\nAnalyse ${e.reference}. Record relevant statements with exact quotes and transcript segment IDs, and audible events from the acoustic analysis (describe them as a sudden loud sound; do not guess the cause). Speaker changes may only be inferred from content and must be marked as inference. The transcript is automatic and may contain errors; flag passages that read as garbled.`,
        },
      ],
      ctx: { ...baseCtx, durationSeconds: p.duration_seconds, transcript: transcript.segments },
      images: 0,
      mediaSeconds: p.duration_seconds ?? 0,
      config: { transcription: transcript.engine },
    };
  }

  if (e.evidence_type === "image") {
    const p = await probe(file).catch(() => null);
    if (p) mergeMetadata(e.id, { technical: { width: p.video?.width, height: p.video?.height, tags: p.tags } });
    const dir = derivedDir(e.id, runId);
    const still = path.join(dir, "analysis.jpg");
    await makeStill(file, still);
    saveExtraction(e.id, runId, "image_still", { file: path.relative(path.join(dir, ".."), still) });
    return {
      content: [
        { type: "text", text: `<evidence>\n${header(e, [p?.video ? `Dimensions: ${p.video.width}x${p.video.height}` : ""])}` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(still).toString("base64") } },
        {
          type: "text",
          text: `</evidence>\n\nAnalyse ${e.reference}. Describe observable details and transcribe any readable text exactly (as quote). Where a detail occupies a specific area, give image_region in 0-1000 coordinates. Do not infer facts that cannot be established from the image itself (e.g. when or where it was taken, unless visible).`,
        },
      ],
      ctx: baseCtx,
      images: 1,
      mediaSeconds: 0,
      config: {},
    };
  }

  // Documents and written accounts
  const ext = path.extname(e.original_filename).toLowerCase();
  let doc: DocumentExtraction;
  if (ext === ".pdf") doc = await extractPdf(file);
  else if (ext === ".docx") doc = await extractDocx(file);
  else if (ext === ".txt") doc = extractPlainText(file);
  else doc = toExtraction(ext, await parseDocument(ext, fs.readFileSync(file)));
  saveExtraction(e.id, runId, "document_text", doc, doc.quality, doc.quality_note);
  mergeMetadata(e.id, { pages: doc.total_pages, extraction_method: doc.method });
  if (doc.quality === "failed") throw new Error(doc.quality_note ?? "Text extraction failed");

  const paginated = ext === ".pdf";
  const meta = parseJson<Record<string, unknown>>(e.metadata, {});
  const content: Block[] = [
    {
      type: "text",
      text: `<evidence>\n${header(e, [
        paginated ? `Pages: ${doc.total_pages}` : "Unpaginated text: cite passages by quote; page_number must be null.",
        meta.stated_author ? `Author as entered by uploader: ${meta.stated_author} (not verified)` : "",
        doc.quality_note ? `Extraction note: ${doc.quality_note}` : "",
      ])}\n\n${doc.pages.map((pg) => (paginated ? `--- Page ${pg.page_number} ---\n${pg.text || "[no text layer]"}` : pg.text)).join("\n\n")}`,
    },
  ];
  // Scanned pages: give the model the PDF itself so it can read them visually.
  if (paginated && doc.low_text_pages.length > 0 && e.file_size < 30 * 1024 * 1024) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync(file).toString("base64") },
    });
  }
  content.push({
    type: "text",
    text: `</evidence>\n\nAnalyse ${e.reference}. For every statement or document fact give the exact supporting passage as quote${paginated ? " and its page_number" : ""}. Record dates and times exactly as written in event_time.stated_text; only fill iso_datetime when the text states a full or partial date.`,
  });
  return {
    content,
    ctx: { ...baseCtx, pages: doc.pages, paginated, unverifiablePages: doc.low_text_pages },
    images: 0,
    mediaSeconds: 0,
    config: { extraction: doc.method, quality: doc.quality },
  };
}

function mergeMetadata(evidenceId: string, patch: Record<string, unknown>) {
  const row = get<{ metadata: string }>("SELECT metadata FROM evidence WHERE id = ?", evidenceId);
  const merged = { ...parseJson<Record<string, unknown>>(row?.metadata, {}), ...patch };
  run("UPDATE evidence SET metadata = ? WHERE id = ?", JSON.stringify(merged), evidenceId);
}

// ---------------------------------------------------------------------------
// Deeper inspection of one video segment

export async function inspectSegmentRun(runId: string, heartbeat: () => void) {
  const r = getRun(runId);
  if (!r || !r.evidence_id) throw new Error("Run not found");
  const e = getEvidence(r.evidence_id)!;
  const cfg = parseJson<{ center: number; half_window: number }>(r.processing_configuration, { center: 0, half_window: 3 });
  let auth: Authorisation;
  try {
    auth = authorise({ operation: "frame_analysis", provider: "anthropic", organisationId: caseOrganisation(e.case_id), caseId: e.case_id, evidenceId: e.id, user: null, modelVersion: MODEL });
  } catch (err) {
    failRun(runId, `Blocked by processing policy: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
  startRun(runId, MODEL, { pipeline: PIPELINE_VERSION, ...cfg });
  run("UPDATE analysis_runs SET policy_id = ?, policy_version = ? WHERE id = ?", auth.policyId, auth.policyVersion, runId);
  const tmp = decryptToTemp(e.storage_reference);
  try {
    const file = tmp.file;
    const p = await probe(file);
    const duration = p.duration_seconds ?? 0;
    const start = Math.max(0, cfg.center - cfg.half_window);
    const end = Math.min(duration - 0.05, cfg.center + cfg.half_window);
    setStage(runId, "Extracting dense frames");
    const dir = derivedDir(e.id, runId);
    const frames: { t: number; file: string }[] = [];
    for (let t = start, i = 0; t <= end && i < 24; t += 0.5, i++) {
      const out = path.join(dir, `seg_${String(i).padStart(3, "0")}.jpg`);
      await extractFrame(file, t, out, 960);
      if (fs.existsSync(out)) frames.push({ t: Math.round(t * 100) / 100, file: out });
    }
    heartbeat();
    saveExtraction(e.id, runId, "segment_frames", { start, end, frames: frames.map((f) => ({ t: f.t, file: path.relative(path.join(dir, ".."), f.file) })) });
    const transcriptRow = get<{ content: string }>(
      "SELECT content FROM extractions WHERE evidence_id = ? AND kind = 'transcript' ORDER BY created_at DESC LIMIT 1",
      e.id,
    );
    const transcript = parseJson<Transcript | null>(transcriptRow?.content, null);
    const segs = (transcript?.segments ?? []).filter((s) => s.end_seconds >= start && s.start_seconds <= end);
    const existing = all<{ reference: string; description: string; source_reference: string }>(
      "SELECT reference, description, source_reference FROM observations WHERE evidence_id = ? AND superseded = 0",
      e.id,
    );

    const content: Block[] = [
      {
        type: "text",
        text: `<evidence>\n${header(e, [metadataText(p)])}\n\nDetailed inspection of ${start.toFixed(2)}s–${end.toFixed(2)}s (frames every 0.5 s).\n\n## Transcript in this window\n${transcriptText(transcript ? { ...transcript, segments: segs } : null)}`,
      },
    ];
    for (const f of frames) {
      content.push({ type: "text", text: `Frame at t=${f.t.toFixed(2)}s` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(f.file).toString("base64") } });
    }
    content.push({
      type: "text",
      text: `</evidence>\n\nExisting observations for this item (do not repeat them; add only new or more precise detail):\n${existing
        .map((o) => `${o.reference}: ${o.description}`)
        .join("\n")}\n\nDescribe movement and changes across these consecutive frames precisely, with time ranges and the frame timestamps relied on.`,
    });
    setStage(runId, "Analysing segment");
    const ai = await callStructured({
      authorisation: auth,
      runId,
      purpose: "segment:video",
      system: EVIDENCE_SYSTEM_PROMPT,
      content,
      schema: EvidenceAnalysisSchema,
      effort: "high",
      usage: { images: frames.length, mediaSeconds: end - start },
    });
    setStage(runId, "Validating citations");
    storeObservations(
      e,
      runId,
      ai.observations,
      {
        evidenceType: "video",
        durationSeconds: duration,
        sampledFrameTimes: frames.map((f) => f.t),
        transcript: transcript?.segments ?? [],
        pages: null,
        paginated: false,
        unverifiablePages: [],
      },
      { supersedePrevious: false },
    );
    completeRun(runId);
    touchCase(e.case_id);
  } catch (err) {
    failRun(runId, describeAiError(err));
    throw err;
  } finally {
    tmp.cleanup();
    sealDerived(e.id);
  }
}
