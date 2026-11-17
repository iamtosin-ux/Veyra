// Renders demo MediaSpecs into real files with FFmpeg, macOS `say`, pdf-lib and docx.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { Label, MediaSpec, Mover, Rect } from "../../src/server/demo/types";

const FF = ffmpegStatic as unknown as string;
const ff = (args: string[]) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

function say(text: string, voice: string, file: string) {
  try {
    execFileSync("say", ["-v", voice, "-o", file, text]);
  } catch {
    execFileSync("say", ["-o", file, text]);
  }
}

/** Escape text for an FFmpeg drawtext value wrapped in single quotes. */
function dt(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
}

const enable = (o: { from?: number; to?: number }) => (o.from != null || o.to != null ? `:enable='between(t,${o.from ?? 0},${(o.to ?? 1e6) - 0.001})'` : "");
const rectF = (r: Rect) => `drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=${r.color}:t=fill${enable(r)}`;
const labelF = (l: Label) =>
  `drawtext=text='${dt(l.text)}':fontcolor=${l.color}:fontsize=${l.size}:x=${l.x}:y=${l.y}${l.box ? ":box=1:boxcolor=black@0.5:boxborderw=4" : ""}${enable(l)}`;

/** Piecewise-linear expression over keyframes for one coordinate. */
function pathExpr(path: [number, number, number][], axis: 1 | 2, offset = 0): string {
  if (path.length === 1) return String(path[0][axis] + offset);
  let expr = String(path[path.length - 1][axis] + offset);
  for (let i = path.length - 2; i >= 0; i--) {
    const [t0] = path[i];
    const [t1] = path[i + 1];
    const a = path[i][axis] + offset;
    const b = path[i + 1][axis] + offset;
    expr = `if(lt(t,${t1}),${a}+(${b - a})*(t-${t0})/${t1 - t0},${expr})`;
  }
  return `if(lt(t,${path[0][0]}),${path[0][axis] + offset},${expr})`;
}

function clockLabels(c: NonNullable<Extract<MediaSpec, { kind: "video" }>["clock"]>, duration: number): { graph: string; labels: Label[] } {
  const start = Date.parse(c.startIso) / 1000;
  if (!c.secondsPerSecond || c.secondsPerSecond === 1) {
    const text = `%{pts\\:gmtime\\:${start}\\:%Y-%m-%d %H\\\\\\:%M\\\\\\:%S}`;
    return { graph: `drawtext=text='${text}':fontcolor=white:fontsize=16:x=${c.x}:y=${c.y}:box=1:boxcolor=black@0.5:boxborderw=4`, labels: [] };
  }
  // Timelapse: a static label per 2-second step.
  const labels: Label[] = [];
  for (let t = 0; t < duration; t += 2) {
    const d = new Date((start + t * c.secondsPerSecond) * 1000).toISOString();
    labels.push({ text: `${d.slice(0, 10)} ${d.slice(11, 16)}`, x: c.x, y: c.y, size: 16, color: "white", box: true, from: t, to: t + 2 });
  }
  return { graph: "", labels };
}

export async function render(spec: MediaSpec, out: string, tmp: string) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  switch (spec.kind) {
    case "video":
      return renderVideo(spec, out, tmp);
    case "audio": {
      const parts = spec.segments.map((s, i) => {
        const f = path.join(tmp, `${path.basename(out)}.${i}.aiff`);
        say(s.text, s.voice, f);
        return f;
      });
      const inputs = parts.flatMap((p) => ["-i", p]);
      const chain = parts.map((_, i) => `[${i}:a]aresample=22050,apad=pad_dur=0.6[a${i}]`).join(";");
      const concat = parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[out]`;
      ff([...inputs, "-filter_complex", `${chain};${concat}`, "-map", "[out]", "-ac", "1", "-c:a", "aac", "-b:a", "64k", ...(spec.creationTime ? ["-metadata", `creation_time=${spec.creationTime}`] : []), out]);
      return;
    }
    case "image": {
      const vf = [...spec.rects.map(rectF), ...spec.labels.map(labelF)].join(",") || "null";
      ff(["-f", "lavfi", "-i", `color=c=${spec.bg}:s=${spec.size[0]}x${spec.size[1]}:d=1`, "-vf", vf, "-frames:v", "1", ...(spec.format === "webp" ? ["-c:v", "libwebp"] : []), out]);
      return;
    }
    case "pdf": {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (const lines of spec.pages) {
        const page = pdf.addPage([595, 842]);
        let y = 780;
        for (const line of lines) {
          const heading = line.startsWith("# ");
          page.drawText(heading ? line.slice(2) : line, { x: 56, y, size: heading ? 13 : 11, font: heading ? bold : font, color: rgb(0.1, 0.1, 0.1) });
          y -= heading ? 26 : 18;
        }
      }
      fs.writeFileSync(out, await pdf.save());
      return;
    }
    case "docx": {
      const doc = new Document({ sections: [{ children: [new Paragraph({ text: spec.title, heading: HeadingLevel.HEADING_1 }), ...spec.paragraphs.map((p) => new Paragraph(p))] }] });
      fs.writeFileSync(out, await Packer.toBuffer(doc));
      return;
    }
    case "txt":
      fs.writeFileSync(out, spec.text);
      return;
  }
}

function renderVideo(spec: Extract<MediaSpec, { kind: "video" }>, out: string, tmp: string) {
  const [w, h] = spec.size;
  const inputs: string[] = ["-f", "lavfi", "-i", `color=c=${spec.bg}:s=${w}x${h}:d=${spec.duration}:r=15`];
  let idx = 1;
  const graph: string[] = [];
  graph.push(`[0:v]${[...spec.rects.map(rectF)].join(",") || "null"}[s0]`);
  let cur = "s0";
  const overlayMover = (m: Mover) => {
    const layers = [{ w: m.w, h: m.h, color: m.color, dx: 0, dy: 0 }, ...(m.head ? [m.head] : [])];
    for (const l of layers) {
      inputs.push("-f", "lavfi", "-i", `color=c=${l.color}:s=${l.w}x${l.h}:d=${spec.duration}:r=15`);
      const next = `s${idx}`;
      graph.push(`[${cur}][${idx}:v]overlay=x='${pathExpr(m.path, 1, l.dx)}':y='${pathExpr(m.path, 2, l.dy)}':enable='between(t,${m.from},${m.to})'[${next}]`);
      cur = next;
      idx++;
    }
  };
  spec.movers.forEach(overlayMover);
  const clock = spec.clock ? clockLabels(spec.clock, spec.duration) : { graph: "", labels: [] };
  const top = [...spec.labels, ...clock.labels].map(labelF);
  if (clock.graph) top.push(clock.graph);
  graph.push(`[${cur}]${top.join(",") || "null"}[v]`);

  const audioIn: string[] = [];
  const audioGraph: string[] = [];
  if (spec.audio) {
    audioGraph.push(`anoisesrc=d=${spec.duration}:c=pink:a=0.004[tone]`);
    const mix = ["[tone]"];
    (spec.audio.bangs ?? []).forEach((b, i) => {
      const ms = Math.round(b.at * 1000);
      audioGraph.push(`anoisesrc=d=${b.dur ?? 0.35}:c=white:a=${b.amp ?? 0.9},adelay=${ms}|${ms}[b${i}]`);
      mix.push(`[b${i}]`);
    });
    (spec.audio.speech ?? []).forEach((s, i) => {
      const f = path.join(tmp, `${path.basename(out)}.speech${i}.aiff`);
      say(s.text, s.voice, f);
      audioIn.push("-i", f);
      const ms = Math.round(s.at * 1000);
      audioGraph.push(`[${idx}:a]aresample=44100,adelay=${ms}|${ms}[sp${i}]`);
      mix.push(`[sp${i}]`);
      idx++;
    });
    audioGraph.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first[a]`);
  }
  ff([
    ...inputs,
    ...audioIn,
    "-filter_complex",
    [...graph, ...audioGraph].join(";"),
    "-map",
    "[v]",
    ...(spec.audio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "96k"] : ["-an"]),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...(spec.creationTime ? ["-metadata", `creation_time=${spec.creationTime}`] : []),
    "-t",
    String(spec.duration),
    out,
  ]);
}
