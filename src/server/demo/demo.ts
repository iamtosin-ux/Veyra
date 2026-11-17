import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { all, get, now, parseJson, run, tx } from "../db";
import { HttpError, type User } from "../auth";
import { createCase } from "../cases";
import { addEvidence, getEvidence } from "../evidence";
import { enqueueJob } from "../jobs";
import type { AiObservation, CaseAnalysis } from "../ai/schemas";
import { processEvidenceRun, type EvidenceAnalyser } from "../analysis/evidencePipeline";
import { analyseCaseRun, type CaseAnalyser } from "../analysis/caseAnalysis";
import { SCENARIOS, getScenario } from "./scenarios";
import type { DemoItem, DemoScenario } from "./types";

// Demo mode: the real extraction and validation pipeline with the AI step
// replaced by hand-written content. Demo cases are flagged everywhere they appear.

export const DEMO_MODEL = "demo:hand-written";

const SAMPLE_ROOT = path.resolve(process.env.SAMPLE_DIR ?? path.join(process.cwd(), "sample"));

export const scenarioDir = (s: DemoScenario) => path.join(SAMPLE_ROOT, s.id);

function scenarioForCase(caseId: string): DemoScenario | undefined {
  const row = get<{ demo_scenario: string | null }>("SELECT demo_scenario FROM cases WHERE id = ?", caseId);
  return row?.demo_scenario ? getScenario(row.demo_scenario) : undefined;
}

function demoItemFor(scenario: DemoScenario | undefined, filename: string, duplicateOf: string | null): DemoItem | null {
  if (!scenario) return null;
  if (scenario.items[filename]) return scenario.items[filename];
  if (duplicateOf) {
    const original = getEvidence(duplicateOf);
    if (original && scenario.items[original.original_filename]) return scenario.items[original.original_filename];
  }
  return null;
}

export const demoEvidenceAnalyser: EvidenceAnalyser = {
  model: DEMO_MODEL,
  provider: null,
  analyse: async (e, prepared) => {
    const item = demoItemFor(scenarioForCase(e.case_id), e.original_filename, e.duplicate_of);
    if (!item) {
      return { summary: "No demo content was prepared for this file.", extraction_issues: ["Demo mode only covers the scenario's sample files."], observations: [] };
    }
    const sampled = prepared.ctx.sampledFrameTimes;
    const observations: AiObservation[] = item.observations.map((o) => {
      let frames: number[] = [];
      if (o.frame_window && sampled.length) {
        const [a, b] = o.frame_window;
        frames = sampled.filter((t) => t >= a && t <= b);
        if (frames.length === 0) {
          const mid = (a + b) / 2;
          frames = [sampled.reduce((best, t) => (Math.abs(t - mid) < Math.abs(best - mid) ? t : best), sampled[0])];
        }
      }
      return {
        observation_type: o.observation_type,
        description: o.description,
        quote: o.quote ?? null,
        start_time_seconds: o.start_time_seconds ?? null,
        end_time_seconds: o.end_time_seconds ?? null,
        frame_times: frames,
        transcript_segment_ids: [],
        page_number: o.page_number ?? null,
        image_region: o.image_region ?? null,
        event_time: o.event_time ?? null,
        speaker_label: o.speaker_label ?? null,
        requires_review: o.requires_review ?? false,
        uncertainty_reason: o.uncertainty_reason ?? null,
      };
    });
    return { summary: `[Demo] ${item.summary}`, extraction_issues: item.extraction_issues, observations };
  },
};

export const demoCaseAnalyser: CaseAnalyser = {
  model: DEMO_MODEL,
  provider: null,
  analyse: async ({ runId, observations }) => {
    const caseId = get<{ case_id: string }>("SELECT case_id FROM analysis_runs WHERE id = ?", runId)?.case_id ?? "";
    const scenario = scenarioForCase(caseId);
    if (!scenario) return { findings: [], chronology: [], coverage_notes: ["No demo scenario is linked to this case."], case_summary: "" };
    const files = new Map(
      all<{ id: string; original_filename: string }>("SELECT id, original_filename FROM evidence WHERE case_id = ?", caseId).map((r) => [r.id, r.original_filename]),
    );
    // "<file>#<key>" → OBS reference, via the hand-written description of that key.
    const resolve = (r: string): string => {
      const [file, key] = r.split("#");
      const description = scenario.items[file]?.observations.find((o) => o.key === key)?.description;
      const hit = observations.find((o) => files.get(o.evidence_id) === file && o.description === description);
      // Unresolvable references pass through so validation records them.
      return hit?.reference ?? `UNRESOLVED:${r}`;
    };
    const out: CaseAnalysis = {
      findings: scenario.case.findings.map(({ refs, ...f }) => ({ ...f, observation_refs: refs.map(resolve) })),
      chronology: scenario.case.chronology.map(({ refs, ...c }) => ({ ...c, observation_refs: refs.map(resolve) })),
      coverage_notes: scenario.case.coverage_notes,
      case_summary: scenario.description,
    };
    return out;
  },
};

export function listDemoScenarios() {
  return SCENARIOS.map((s) => ({
    id: s.id,
    industry: s.industry,
    title: s.title,
    description: s.description,
    files: s.files.length,
    available: s.files.every((f) => fs.existsSync(path.join(scenarioDir(s), f))),
  }));
}

/** Create a demo case from sample/<scenario>/ and queue its (non-AI) processing. */
export function createDemoCase(user: User, scenarioId = "social-housing") {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new HttpError(404, "Unknown demo scenario");
  const dir = scenarioDir(scenario);
  if (!scenario.files.every((f) => fs.existsSync(path.join(dir, f)))) {
    throw new HttpError(404, "Sample files for this demo are missing. Run `npm run sample` to generate them.");
  }
  const c = createCase(
    user,
    `DEMO · ${scenario.title}`,
    `${scenario.description}\n\nDemonstration case built from synthetic files. Extraction (frames, transcription, sound detection, document text) is real; the observations, findings and timeline were written by hand and are NOT AI output.`,
  );
  run("UPDATE cases SET is_demo = 1, industry = ?, case_type = ?, demo_scenario = ? WHERE id = ?", scenario.industry, scenario.caseType ?? null, scenario.id, c.id);
  for (const f of scenario.files) {
    const r = addEvidence(user, c.id, f, fs.readFileSync(path.join(dir, f)));
    if (!r.ok) throw new HttpError(500, `Could not add ${f}: ${r.error}`);
  }
  const runIds = tx(() => {
    const ids: string[] = [];
    for (const e of all<{ id: string; file_hash: string }>("SELECT id, file_hash FROM evidence WHERE case_id = ? ORDER BY reference", c.id)) {
      const id = crypto.randomUUID();
      run(
        "INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, evidence_hash, created_at) VALUES (?, ?, ?, 'evidence', 'queued', 'Queued', ?, ?)",
        id,
        c.id,
        e.id,
        e.file_hash,
        now(),
      );
      run("UPDATE evidence SET processing_status = 'queued' WHERE id = ?", e.id);
      ids.push(id);
    }
    const caseRun = crypto.randomUUID();
    run("INSERT INTO analysis_runs (id, case_id, scope, status, stage, created_at) VALUES (?, ?, 'case', 'queued', 'Queued', ?)", caseRun, c.id, now());
    enqueueJob("seed_demo", { evidenceRuns: ids, caseRun });
    return ids;
  });
  return { caseId: c.id, queued: runIds.length };
}

/** Worker handler: process each item with the demo analyser, then the cross-evidence step. */
export async function runDemoJob(payload: string, heartbeat: () => void) {
  const { evidenceRuns, caseRun } = parseJson<{ evidenceRuns: string[]; caseRun: string }>(payload, { evidenceRuns: [], caseRun: "" });
  for (const id of evidenceRuns) {
    try {
      await processEvidenceRun(id, heartbeat, demoEvidenceAnalyser);
    } catch {
      // Failure is recorded on the run and evidence; carry on with the rest.
    }
    heartbeat();
  }
  const caseId = get<{ case_id: string }>("SELECT case_id FROM analysis_runs WHERE id = ?", caseRun)?.case_id;
  if (caseId && get("SELECT id FROM observations WHERE case_id = ? LIMIT 1", caseId)) {
    await analyseCaseRun(caseRun, heartbeat, demoCaseAnalyser);
  } else {
    run("UPDATE analysis_runs SET status = 'failed', error_details = 'No observations were produced' WHERE id = ?", caseRun);
  }
}
