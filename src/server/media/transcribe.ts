import path from "node:path";
import { DATA_DIR } from "../db";
import { PCM_RATE } from "./ffmpeg";

export interface TranscriptSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface Transcript {
  engine: string;
  language: string | null;
  segments: TranscriptSegment[];
  note: string | null;
}

const MODEL = process.env.WHISPER_MODEL ?? "onnx-community/whisper-base.en";

type Asr = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;

let asrPromise: Promise<Asr> | null = null;

async function loadAsr(): Promise<Asr> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const t = await import("@huggingface/transformers");
      // Models are cached on disk; first run downloads the model weights.
      t.env.cacheDir = path.join(DATA_DIR, "models");
      const p = await t.pipeline("automatic-speech-recognition", MODEL, { dtype: "fp32" });
      return p as unknown as Asr;
    })();
    asrPromise.catch(() => (asrPromise = null));
  }
  return asrPromise;
}

/**
 * Find spans that contain sound well above the background level. Whisper's own
 * timestamps drift badly across long silences, so each span is transcribed
 * separately and offset to its absolute position in the recording.
 */
export function detectSpeechRegions(pcm: Float32Array, rate = PCM_RATE): { start: number; end: number }[] {
  const win = Math.round(rate * 0.05);
  const levels: number[] = [];
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j] * pcm[j];
    levels.push(20 * Math.log10(Math.max(Math.sqrt(sum / win), 1e-6)));
  }
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  // Above the noise floor, but never above typical loud content (recordings that are almost all speech).
  const threshold = Math.max(Math.min(p10 + 12, p90 - 6), -50);
  const winSec = win / rate;
  const raw: { start: number; end: number }[] = [];
  let open: number | null = null;
  levels.forEach((l, i) => {
    if (l >= threshold && open == null) open = i;
    if (l < threshold && open != null) {
      raw.push({ start: open * winSec, end: i * winSec });
      open = null;
    }
  });
  if (open != null) raw.push({ start: open * winSec, end: levels.length * winSec });
  // Merge short gaps (pauses between words), drop blips (clicks, single impacts).
  const merged: { start: number; end: number }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < 0.8) last.end = r.end;
    else merged.push({ ...r });
  }
  const total = pcm.length / rate;
  const regions = merged
    .filter((r) => r.end - r.start >= 0.8)
    .map((r) => ({ start: Math.max(0, r.start - 0.3), end: Math.min(total, r.end + 0.3) }));
  // Keep each window inside Whisper's 30 s context.
  const out: { start: number; end: number }[] = [];
  for (const r of regions) {
    for (let t = r.start; t < r.end; t += 25) out.push({ start: t, end: Math.min(r.end, t + 25) });
  }
  return out;
}

/**
 * Local Whisper transcription with absolute segment timestamps. Runs on-device
 * so raw audio is not sent to a third party for transcription.
 */
export async function transcribe(pcm: Float32Array): Promise<Transcript> {
  const durationSeconds = pcm.length / PCM_RATE;
  if (durationSeconds < 0.3) return { engine: MODEL, language: null, segments: [], note: "Audio too short to transcribe" };
  const regions = detectSpeechRegions(pcm);
  if (regions.length === 0) return { engine: MODEL, language: null, segments: [], note: "No speech-like sound detected" };
  const asr = await loadAsr();
  const segments: TranscriptSegment[] = [];
  for (const region of regions) {
    const slice = pcm.subarray(Math.floor(region.start * PCM_RATE), Math.ceil(region.end * PCM_RATE));
    const out = await asr(slice, { return_timestamps: true });
    const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, region.end - region.start] as [number, number], text: out.text }];
    for (const c of chunks) {
      const text = c.text.trim().replace(/^\.+\s*/, "");
      if (!text || /^\[?\(?(BLANK_AUDIO|MUSIC|silence|inaudible)\)?\]?$/i.test(text)) continue;
      const start = region.start + Math.max(0, c.timestamp[0] ?? 0);
      const end = Math.min(region.end, region.start + (c.timestamp[1] ?? region.end - region.start));
      segments.push({ id: `S${segments.length + 1}`, start_seconds: round(start), end_seconds: round(Math.max(end, start)), text });
    }
  }
  return {
    engine: MODEL,
    language: "en",
    segments,
    note:
      segments.length === 0
        ? "No intelligible speech detected"
        : "Automatic transcription; may contain errors. Speaker identities are not determined.",
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
