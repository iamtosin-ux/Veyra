import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/server/demo/scenarios";
import { quoteAppearsIn } from "@/server/analysis/validate";
import { extractDocx, extractPdf, extractPlainText } from "@/server/extract/document";

const SAMPLE = path.resolve("sample");

describe.each(SCENARIOS.map((s) => [s.id, s] as const))("demo scenario %s", (_id, s) => {
  it("has media and analysis for every file, and no analysis for unknown files", () => {
    for (const f of s.files) {
      expect(s.media[f], `media for ${f}`).toBeDefined();
      expect(s.items[f], `analysis for ${f}`).toBeDefined();
    }
    expect(Object.keys(s.items).sort()).toEqual([...s.files].sort());
  });

  it("every finding and chronology reference points at a defined observation", () => {
    const refs = [...s.case.findings.flatMap((f) => f.refs), ...s.case.chronology.flatMap((c) => c.refs)];
    const unknown = refs.filter((r) => {
      const [file, key] = r.split("#");
      return !s.items[file]?.observations.some((o) => o.key === key);
    });
    expect(unknown).toEqual([]);
  });

  it("observation keys are unique per file and descriptions unique per file", () => {
    for (const f of s.files) {
      const obs = s.items[f].observations;
      expect(new Set(obs.map((o) => o.key)).size).toBe(obs.length);
      expect(new Set(obs.map((o) => o.description)).size).toBe(obs.length);
    }
  });

  const dir = path.join(SAMPLE, s.id);
  it.skipIf(!fs.existsSync(dir))("document and written-account quotes appear in the generated files", async () => {
    const missing: string[] = [];
    for (const f of s.files) {
      const ext = path.extname(f);
      if (![".pdf", ".docx", ".txt"].includes(ext)) continue;
      const full = path.join(dir, f);
      const doc = ext === ".pdf" ? await extractPdf(full) : ext === ".docx" ? await extractDocx(full) : extractPlainText(full);
      for (const o of s.items[f].observations) {
        if (!o.quote) continue;
        const pages = o.page_number ? doc.pages.filter((p) => p.page_number === o.page_number) : doc.pages;
        if (!pages.some((p) => quoteAppearsIn(o.quote!, p.text))) missing.push(`${f}#${o.key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
