import crypto from "node:crypto";
import { all, get, now, run, tx } from "./db";

export type JobKind = "process_evidence" | "inspect_segment" | "analyse_case" | "seed_demo" | "run_workflow" | "check_integrity";

export interface Job {
  id: string;
  kind: JobKind;
  payload: string;
  status: string;
  attempts: number;
}

const STALE_AFTER_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 2;

export function enqueueJob(kind: JobKind, payload: Record<string, unknown>): string {
  const id = crypto.randomUUID();
  const ts = now();
  run(
    "INSERT INTO jobs (id, kind, payload, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)",
    id,
    kind,
    JSON.stringify(payload),
    ts,
    ts,
  );
  return id;
}

/** Atomically claim the oldest queued job. Safe across processes. */
export function claimNextJob(): Job | null {
  return tx(() => {
    const job = get<Job>("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1");
    if (!job) return null;
    const ts = now();
    run(
      "UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?",
      ts,
      ts,
      ts,
      job.id,
    );
    return { ...job, status: "running", attempts: job.attempts + 1 };
  });
}

export function heartbeat(jobId: string) {
  run("UPDATE jobs SET heartbeat_at = ? WHERE id = ?", now(), jobId);
}

export function completeJob(jobId: string) {
  run("UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?", now(), jobId);
}

export function failJob(jobId: string, error: string) {
  run("UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", error, now(), jobId);
}

/**
 * Jobs whose worker died mid-run (no heartbeat) are re-queued, or failed once
 * they have used their attempts. Returns the jobs that were given up on.
 */
export function recoverStaleJobs(): Job[] {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  return tx(() => {
    const stale = all<Job>("SELECT * FROM jobs WHERE status = 'running' AND heartbeat_at < ?", cutoff);
    const givenUp: Job[] = [];
    for (const job of stale) {
      if (job.attempts >= MAX_ATTEMPTS) {
        run("UPDATE jobs SET status = 'failed', error = 'Worker stopped responding', updated_at = ? WHERE id = ?", now(), job.id);
        givenUp.push(job);
      } else {
        run("UPDATE jobs SET status = 'queued', updated_at = ? WHERE id = ?", now(), job.id);
      }
    }
    return givenUp;
  });
}

