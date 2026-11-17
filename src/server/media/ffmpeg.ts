import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const FFMPEG = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string);
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic.path;

function exec(bin: string, args: string[], opts: { binary?: boolean } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 4_000_000) err = err.slice(-2_000_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${opts.binary ? "ffmpeg" : bin.split("/").pop()} exited ${code}: ${err.slice(-500)}`));
    });
  });
}

export interface MediaProbe {
  duration_seconds: number | null;
  container: string | null;
  container_creation_time: string | null;
  tags: Record<string, string>;
  video: { codec: string; width: number; height: number; fps: number | null; rotation: number | null } | null;
  audio: { codec: string; sample_rate: number; channels: number } | null;
}

export async function probe(file: string): Promise<MediaProbe> {
  const { stdout } = await exec(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout.toString());
  const streams: Record<string, unknown>[] = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition as Record<string, number>)?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");
  const fmt = j.format ?? {};
  const tags: Record<string, string> = { ...(fmt.tags ?? {}) };
  const rate = typeof v?.avg_frame_rate === "string" ? v.avg_frame_rate.split("/").map(Number) : null;
  const sideData = (v?.side_data_list as { rotation?: number }[] | undefined)?.find((s) => s.rotation != null);
  return {
    duration_seconds: fmt.duration ? Number(fmt.duration) : null,
    container: fmt.format_long_name ?? fmt.format_name ?? null,
    container_creation_time: tags.creation_time ?? null,
    tags,
    video: v
      ? {
          codec: String(v.codec_name),
          width: Number(v.width),
          height: Number(v.height),
          fps: rate && rate[1] ? Math.round((rate[0] / rate[1]) * 100) / 100 : null,
          rotation: sideData?.rotation ?? null,
        }
      : null,
    audio: a ? { codec: String(a.codec_name), sample_rate: Number(a.sample_rate), channels: Number(a.channels) } : null,
  };
}

export const PCM_RATE = 16000;

/** Decode the audio track to mono 16 kHz float PCM (used for transcription and signal analysis). */
export async function decodeAudio(file: string): Promise<Float32Array> {
  const { stdout } = await exec(FFMPEG, ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(PCM_RATE), "-f", "f32le", "pipe:1"], {
    binary: true,
  });
  const copy = new Uint8Array(stdout.byteLength);
  copy.set(stdout);
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}

/** Timestamps where the picture changes substantially (FFmpeg scene score). */
export async function detectSceneChanges(file: string, threshold = 0.3): Promise<number[]> {
  const { stderr } = await exec(FFMPEG, ["-hide_banner", "-i", file, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], {
    binary: true,
  });
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) times.push(Number(m[1]));
  return times;
}

export async function extractFrame(file: string, seconds: number, outFile: string, width = 768): Promise<void> {
  await exec(
    FFMPEG,
    ["-v", "error", "-ss", seconds.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", "-y", outFile],
    { binary: true },
  );
}

export async function makeStill(file: string, outFile: string, maxWidth = 1568): Promise<void> {
  // Normalise images (e.g. WEBP/huge photos) to a bounded JPEG for analysis; original untouched.
  await exec(FFMPEG, ["-v", "error", "-i", file, "-vf", `scale='min(${maxWidth},iw)':-2`, "-frames:v", "1", "-q:v", "3", "-y", outFile], {
    binary: true,
  });
}

export interface AcousticEvent {
  start_seconds: number;
  end_seconds: number;
  peak_dbfs: number;
  rise_db: number;
}

/**
 * Signal-level detection of abrupt loud sounds (impacts, shouts, bangs).
 * This only says *that* the level jumped, not what caused it.
 */
export function detectAcousticEvents(pcm: Float32Array, rate = PCM_RATE): { events: AcousticEvent[]; baseline_dbfs: number } {
  const win = Math.round(rate * 0.05);
  const levels: number[] = [];
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j] * pcm[j];
    const rms = Math.sqrt(sum / win);
    levels.push(20 * Math.log10(Math.max(rms, 1e-6)));
  }
  if (levels.length === 0) return { events: [], baseline_dbfs: -120 };
  const sorted = [...levels].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.5)];
  const events: AcousticEvent[] = [];
  const winSec = win / rate;
  let i = 0;
  while (i < levels.length) {
    // Compare against the preceding 1 s so speech onsets in a quiet room are not all flagged.
    const prev = levels.slice(Math.max(0, i - 20), i);
    const local = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : baseline;
    const ref = Math.max(local, baseline);
    if (levels[i] > -25 && levels[i] - ref >= 15) {
      let j = i;
      let peak = levels[i];
      while (j + 1 < levels.length && levels[j + 1] > ref + 8) {
        j++;
        peak = Math.max(peak, levels[j]);
      }
      events.push({
        start_seconds: round(i * winSec),
        end_seconds: round((j + 1) * winSec),
        peak_dbfs: round(peak),
        rise_db: round(peak - ref),
      });
      i = j + 1;
    } else i++;
  }
  return { events: events.slice(0, 40), baseline_dbfs: round(baseline) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Adaptive sampling plan: a baseline cadence scaled to duration, plus frames
 * just after each scene change, de-duplicated and capped.
 */
export function planFrameSamples(durationSeconds: number, sceneChanges: number[], maxFrames = 48): number[] {
  const d = Math.max(0, durationSeconds);
  if (d === 0) return [0];
  const baseInterval = Math.max(2, d / Math.min(maxFrames * 0.6, 30));
  const times = new Set<number>();
  for (let t = 0; t < d; t += baseInterval) times.add(round(Math.min(t + 0.5, d - 0.05)));
  for (const s of sceneChanges) times.add(round(Math.min(s + 0.3, d - 0.05)));
  let list = [...times].filter((t) => t >= 0).sort((a, b) => a - b);
  // Drop frames that are too close together, preferring scene-change frames.
  const sceneSet = new Set(sceneChanges.map((s) => round(Math.min(s + 0.3, d - 0.05))));
  const out: number[] = [];
  for (const t of list) {
    const last = out[out.length - 1];
    if (last != null && t - last < 0.8) {
      if (sceneSet.has(t) && !sceneSet.has(last)) out[out.length - 1] = t;
      continue;
    }
    out.push(t);
  }
  list = out;
  if (list.length > maxFrames) {
    const step = list.length / maxFrames;
    list = Array.from({ length: maxFrames }, (_, k) => list[Math.floor(k * step)]);
  }
  return list;
}
