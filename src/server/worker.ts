import { all, get, now, parseJson, run } from "./db";
import { claimNextJob, completeJob, failJob, heartbeat, recoverStaleJobs, type Job } from "./jobs";
import { inspectSegmentRun, processEvidenceRun } from "./analysis/evidencePipeline";
import { analyseCaseRun } from "./analysis/caseAnalysis";
import { demoCaseAnalyser, demoEvidenceAnalyser, runDemoJob } from "./demo/demo";
import { failRun } from "./analysis/runs";
import { executeWorkflowRun } from "./workflows";
import { describeAiError } from "./ai/client";
import { checkEvidenceIntegrity } from "./analysis/integrity";
import { backfillCompliance } from "./compliance/engine";
import { sealExistingStorage } from "./storage";
import { getScenario } from "./demo/scenarios";
import { enqueueJob } from "./jobs";

/** Sample cases created before summaries existed take their hand-written scenario summary. */
function backfillDemoSummaries() {
  for (const c of all<{ id: string; demo_scenario: string | null }>("SELECT id, demo_scenario FROM cases WHERE is_demo = 1 AND summary IS NULL")) {
    const s = c.demo_scenario ? getScenario(c.demo_scenario) : undefined;
    if (s) run("UPDATE cases SET summary = ?, summary_source = 'demo' WHERE id = ?", s.description, c.id);
  }
}

/** Items uploaded before automatic checks existed get checked once. */
function backfillIntegrity() {
  const missing = all<{ id: string }>(
    `SELECT e.id FROM evidence e
      WHERE NOT EXISTS (SELECT 1 FROM integrity_reports r WHERE r.evidence_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind = 'check_integrity' AND j.payload LIKE '%' || e.id || '%')`,
  );
  for (const m of missing) enqueueJob("check_integrity", { evidenceId: m.id });
  if (missing.length) console.log(`[worker] queued integrity checks for ${missing.length} item(s)`);
}

const POLL_MS = 1500;

async function dispatch(job: Job) {
  const { runId, demo } = parseJson<{ runId: string; demo?: boolean }>(job.payload, { runId: "" });
  const beat = () => heartbeat(job.id);
  const timer = setInterval(beat, 30_000);
  try {
    // Demo cases never call the AI provider; they use the hand-written demo analysers.
    if (job.kind === "process_evidence") await processEvidenceRun(runId, beat, demo ? demoEvidenceAnalyser : undefined);
    else if (job.kind === "inspect_segment") await inspectSegmentRun(runId, beat);
    else if (job.kind === "analyse_case") await analyseCaseRun(runId, beat, demo ? demoCaseAnalyser : undefined);
    else if (job.kind === "seed_demo") await runDemoJob(job.payload, beat);
    else if (job.kind === "check_integrity") await checkEvidenceIntegrity(parseJson<{ evidenceId: string }>(job.payload, { evidenceId: "" }).evidenceId);
    else if (job.kind === "run_workflow") await executeWorkflowRun(parseJson<{ workflowRunId: string }>(job.payload, { workflowRunId: "" }).workflowRunId, beat);
    else throw new Error(`Unknown job kind ${job.kind}`);
  } finally {
    clearInterval(timer);
  }
}

/** Mark the analysis run (and evidence) of an abandoned job as failed so the UI never shows a phantom "in progress". */
function abandon(job: Job, reason: string) {
  const wf = parseJson<{ workflowRunId?: string }>(job.payload, {}).workflowRunId;
  if (wf) run("UPDATE workflow_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ? AND status IN ('queued','running')", reason, now(), wf);
  const { runId } = parseJson<{ runId: string }>(job.payload, { runId: "" });
  const r = get<{ evidence_id: string | null; scope: string; status: string }>("SELECT evidence_id, scope, status FROM analysis_runs WHERE id = ?", runId);
  if (!r || r.status === "completed" || r.status === "failed") return;
  failRun(runId, reason);
  if (r.scope === "evidence" && r.evidence_id) {
    run("UPDATE evidence SET processing_status = 'failed', processing_error = ? WHERE id = ?", reason, r.evidence_id);
  }
}

export async function runWorker(signal?: AbortSignal) {
  console.log(`[worker] started ${now()}`);
  const sealed = sealExistingStorage();
  if (sealed) console.log(`[worker] encrypted ${sealed} stored file(s) at rest`);
  const classified = backfillCompliance();
  if (classified) console.log(`[worker] classified ${classified} existing item(s) for compliance`);
  backfillIntegrity();
  backfillDemoSummaries();
  let lastRecovery = 0;
  while (!signal?.aborted) {
    if (Date.now() - lastRecovery > 60_000) {
      for (const j of recoverStaleJobs()) abandon(j, "Processing stopped unexpectedly. Retry to run it again.");
      lastRecovery = Date.now();
    }
    const job = claimNextJob();
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    console.log(`[worker] ${job.kind} ${job.id} (attempt ${job.attempts})`);
    try {
      await dispatch(job);
      completeJob(job.id);
      console.log(`[worker] completed ${job.id}`);
    } catch (e) {
      const message = describeAiError(e);
      // Message only — never evidence content.
      console.error(`[worker] failed ${job.id}: ${message}`);
      failJob(job.id, message);
      abandon(job, message);
    }
  }
}
