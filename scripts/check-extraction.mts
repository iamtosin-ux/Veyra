// Runs the non-AI extraction stages on local files and prints what the AI would receive.
// Usage: npx tsx scripts/check-extraction.mts sample/cctv_corridor_cam2.mp4 [more files...]
import path from "node:path";
import { decodeAudio, detectAcousticEvents, detectSceneChanges, planFrameSamples, probe } from "../src/server/media/ffmpeg";
import { transcribe } from "../src/server/media/transcribe";
import { extractDocx, extractPdf, extractPlainText } from "../src/server/extract/document";

for (const file of process.argv.slice(2)) {
  const ext = path.extname(file).toLowerCase();
  console.log(`\n=== ${file}`);
  if ([".mp4", ".mov", ".mp3", ".wav", ".m4a"].includes(ext)) {
    const p = await probe(file);
    console.log("probe:", JSON.stringify({ duration: p.duration_seconds, video: p.video, audio: p.audio, creation_time: p.container_creation_time }));
    if (p.video) {
      const scenes = await detectSceneChanges(file);
      console.log("scene changes:", scenes);
      console.log("frame plan:", planFrameSamples(p.duration_seconds ?? 0, scenes));
    }
    if (p.audio) {
      const pcm = await decodeAudio(file);
      console.log("acoustic:", JSON.stringify(detectAcousticEvents(pcm)));
      const t0 = Date.now();
      const t = await transcribe(pcm);
      console.log(`transcript (${Date.now() - t0} ms):`);
      for (const s of t.segments) console.log(`  [${s.id}] ${s.start_seconds}-${s.end_seconds}: ${s.text}`);
    }
  } else if (ext === ".pdf") console.log(JSON.stringify(await extractPdf(file), null, 1));
  else if (ext === ".docx") console.log(JSON.stringify(await extractDocx(file), null, 1));
  else if (ext === ".txt") console.log(JSON.stringify(extractPlainText(file), null, 1));
  else console.log("(image: no local extraction; analysed visually)");
}
