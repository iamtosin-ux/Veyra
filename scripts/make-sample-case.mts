// Generates the synthetic demo evidence for every scenario into sample/<scenario>/.
// Usage: npm run sample [scenario-id ...]   (macOS `say` is used for synthetic speech)
import fs from "node:fs";
import path from "node:path";
import { SCENARIOS } from "../src/server/demo/scenarios";
import { render } from "./lib/render-media";

const only = process.argv.slice(2);
for (const s of SCENARIOS) {
  if (only.length && !only.includes(s.id)) continue;
  const dir = path.resolve("sample", s.id);
  const tmp = path.join(dir, ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n${s.industry} — ${s.title}`);
  for (const f of s.files) {
    await render(s.media[f], path.join(dir, f), tmp);
    console.log(`  ${f}  ${fs.statSync(path.join(dir, f)).size} bytes`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
