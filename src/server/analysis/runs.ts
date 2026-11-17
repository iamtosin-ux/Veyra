import crypto from "node:crypto";
import { get, now, run } from "../db";

export interface AnalysisRunRow {
  id: string;
  case_id: string;
  evidence_id: string | null;
  scope: "evidence" | "segment" | "case";
  status: string;
  stage: string | null;
  processing_configuration: string;
  evidence_hash: string | null;
}

export function getRun(id: string): AnalysisRunRow | undefined {
  return get<AnalysisRunRow>("SELECT * FROM analysis_runs WHERE id = ?", id);
}

export function setStage(runId: string, stage: string) {
  run("UPDATE analysis_runs SET stage = ? WHERE id = ?", stage, runId);
}

export function startRun(runId: string, model: string, config: Record<string, unknown>) {
  run(
    "UPDATE analysis_runs SET status = 'running', started_at = ?, model_identifier = ?, processing_configuration = ?, error_details = NULL WHERE id = ?",
    now(),
    model,
    JSON.stringify(config),
    runId,
  );
}

export function completeRun(runId: string) {
  run("UPDATE analysis_runs SET status = 'completed', stage = 'Ready for review', completed_at = ? WHERE id = ?", now(), runId);
}

export function failRun(runId: string, error: string) {
  run("UPDATE analysis_runs SET status = 'failed', stage = 'Failed', completed_at = ?, error_details = ? WHERE id = ?", now(), error, runId);
}

export function recordRejection(runId: string, itemKind: string, reason: string, payload: unknown) {
  run(
    "INSERT INTO validation_rejections (id, analysis_run_id, item_kind, reason, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    runId,
    itemKind,
    reason,
    JSON.stringify(payload),
    now(),
  );
}

export function saveExtraction(
  evidenceId: string,
  runId: string,
  kind: string,
  content: unknown,
  quality: "ok" | "uncertain" | "failed" = "ok",
  note: string | null = null,
) {
  run(
    "INSERT INTO extractions (id, evidence_id, analysis_run_id, kind, content, quality, quality_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    evidenceId,
    runId,
    kind,
    JSON.stringify(content),
    quality,
    note,
    now(),
  );
}
