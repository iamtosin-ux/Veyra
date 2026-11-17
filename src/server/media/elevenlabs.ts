import { assertAuthorised, type Authorisation } from "../compliance/engine";
import { PCM_RATE } from "./ffmpeg";
import type { Transcript, TranscriptSegment } from "./transcribe";

/**
 * ElevenLabs speech to text (Scribe), an optional alternative to local
 * Whisper. It sends the recording's audio to ElevenLabs, so it runs only when
 * ELEVENLABS_API_KEY is set and the processing policy approves ElevenLabs as a
 * provider for transcription; the caller passes that authorisation in.
 */

export const ELEVENLABS_MODEL = "scribe_v2";
const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

export const elevenLabsConfigured = () => !!process.env.ELEVENLABS_API_KEY;

/** Pure: mono 16-bit PCM WAV from float samples. */
export function pcmToWav(pcm: Float32Array, rate = PCM_RATE): Buffer {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + pcm.length * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), 44 + i * 2));
  return b;
}

interface ScribeWord {
  text: string;
  type: "word" | "spacing" | "audio_event";
  start?: number;
  end?: number;
  speaker_id?: string | null;
}

/**
 * Pure: Scribe's words grouped into transcript segments. A segment ends where
 * the speaker changes, after a pause of more than 0.8s, or at 20s, so each one
 * can be cited on its own. Sound events ("[laughter]") stay as their own lines.
 */
export function wordsToSegments(words: ScribeWord[]): TranscriptSegment[] {
  type Open = { start: number; end: number; text: string; speaker: string | null };
  const out: TranscriptSegment[] = [];
  let cur = null as Open | null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ id: `S${out.length + 1}`, start_seconds: cur.start, end_seconds: cur.end, text: (cur.speaker ? `${cur.speaker.replace("speaker_", "Speaker ")}: ` : "") + cur.text.trim() });
    cur = null;
  };
  for (const w of words) {
    if (w.type === "spacing") {
      if (cur) cur.text += w.text;
      continue;
    }
    const start: number = w.start ?? cur?.end ?? 0;
    const end: number = w.end ?? start;
    const speaker = w.speaker_id ?? null;
    if (w.type === "audio_event") {
      flush();
      out.push({ id: `S${out.length + 1}`, start_seconds: start, end_seconds: end, text: w.text.trim() });
      continue;
    }
    if (cur && (speaker !== cur.speaker || start - cur.end > 0.8 || end - cur.start > 20)) flush();
    if (!cur) cur = { start, end, text: "", speaker };
    cur.text += w.text;
    cur.end = end;
  }
  flush();
  return out;
}

export async function transcribeWithElevenLabs(pcm: Float32Array, auth: Authorisation): Promise<Transcript> {
  // Checked before the key, so unauthorised audio never reaches the provider.
  assertAuthorised(auth, "elevenlabs", "transcription");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs isn't configured");
  const form = new FormData();
  form.append("model_id", ELEVENLABS_MODEL);
  form.append("timestamps_granularity", "word");
  form.append("diarize", "true");
  form.append("tag_audio_events", "true");
  form.append("file", new Blob([new Uint8Array(pcmToWav(pcm))], { type: "audio/wav" }), "audio.wav");
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}`);
  const body = (await res.json()) as { language_code?: string; words?: ScribeWord[] };
  const segments = wordsToSegments(body.words ?? []);
  return { engine: `elevenlabs/${ELEVENLABS_MODEL}`, language: body.language_code ?? null, segments, note: segments.length ? null : "No speech detected" };
}
