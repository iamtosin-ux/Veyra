import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, all, get, parseJson, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { createCase, getCaseForUser } from "./cases";
import { storeEvidence } from "./evidence";
import { readOriginal } from "./storage";
import { postMessage } from "./assistant/assistant";

/**
 * Fork a case: an independent copy of its evidence (originals re-stored and
 * re-hashed), extracted content, observations, findings with their review
 * history, chronology and integrity reports. The original case is untouched.
 */
export function forkCase(user: User, caseId: string) {
  const src = getCaseForUser(user, caseId) as ReturnType<typeof getCaseForUser> & { is_demo?: number; industry?: string | null; demo_scenario?: string | null };
  const meta = get<{ is_demo: number; industry: string | null; demo_scenario: string | null; evidence_seq: number; observation_seq: number; finding_seq: number }>(
    "SELECT is_demo, industry, demo_scenario, evidence_seq, observation_seq, finding_seq FROM cases WHERE id = ?",
    caseId,
  )!;
  const dst = createCase(user, `${src.title} (branch)`, src.description);
  run("UPDATE cases SET is_demo = ?, industry = ?, demo_scenario = ? WHERE id = ?", meta.is_demo, meta.industry, meta.demo_scenario, dst.id);

  const evMap = new Map<string, string>();
  const evidence = all<{ id: string; original_filename: string; storage_reference: string; evidence_type: string; processing_status: string; processing_error: string | null; metadata: string }>(
    "SELECT * FROM evidence WHERE case_id = ? ORDER BY reference",
    caseId,
  );
  for (const e of evidence) {
    const r = storeEvidence(user.id, dst.id, e.original_filename, readOriginal(e.storage_reference), {
      type: e.evidence_type as "video",
      metadata: { ...parseJson<Record<string, unknown>>(e.metadata, {}), forked_from: e.id },
    });
    if (!r.ok) throw new HttpError(500, `Could not copy ${e.original_filename}: ${r.error}`);
    evMap.set(e.id, r.evidence.id);
    run("UPDATE evidence SET processing_status = ?, processing_error = ? WHERE id = ?", e.processing_status, e.processing_error, r.evidence.id);
    // Derived artefacts (frames, stills) are copied so extracted content keeps resolving.
    const from = path.join(DATA_DIR, "derived", e.id);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(DATA_DIR, "derived", r.evidence.id), { recursive: true });
  }

  tx(() => {
    const runMap = new Map<string, string>();
    for (const r of all<Record<string, string | null>>("SELECT * FROM analysis_runs WHERE case_id = ? AND status = 'completed'", caseId)) {
      const id = crypto.randomUUID();
      runMap.set(r.id as string, id);
      run(
        "INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, model_identifier, processing_configuration, evidence_hash, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)",
        id,
        dst.id,
        r.evidence_id ? evMap.get(r.evidence_id) ?? null : null,
        r.scope,
        r.stage,
        r.model_identifier,
        r.processing_configuration ?? "{}",
        r.evidence_hash,
        r.started_at,
        r.completed_at,
        r.created_at,
      );
    }
    for (const x of all<Record<string, string>>("SELECT x.* FROM extractions x JOIN evidence e ON e.id = x.evidence_id WHERE e.case_id = ?", caseId)) {
      const runId = runMap.get(x.analysis_run_id);
      const ev = evMap.get(x.evidence_id);
      if (!runId || !ev) continue;
      run("INSERT INTO extractions (id, evidence_id, analysis_run_id, kind, content, quality, quality_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", crypto.randomUUID(), ev, runId, x.kind, x.content, x.quality, x.quality_note, x.created_at);
    }
    const obsMap = new Map<string, string>();
    for (const o of all<Record<string, string | number | null>>("SELECT * FROM observations WHERE case_id = ?", caseId)) {
      const runId = runMap.get(o.analysis_run_id as string);
      const ev = evMap.get(o.evidence_id as string);
      if (!runId || !ev) continue;
      const id = crypto.randomUUID();
      obsMap.set(o.id as string, id);
      run(
        "INSERT INTO observations (id, case_id, evidence_id, analysis_run_id, reference, observation_type, modality, description, quote, source_reference, event_time, uncertainty, review_status, superseded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, dst.id, ev, runId, o.reference, o.observation_type, o.modality, o.description, o.quote, o.source_reference, o.event_time, o.uncertainty, o.review_status, o.superseded, o.created_at,
      );
    }
    for (const f of all<Record<string, string | number | null>>("SELECT * FROM findings WHERE case_id = ?", caseId)) {
      const runId = runMap.get(f.analysis_run_id as string);
      if (!runId) continue;
      const id = crypto.randomUUID();
      run(
        "INSERT INTO findings (id, case_id, analysis_run_id, reference, title, description, finding_type, relationship_explanation, uncertainty, review_status, superseded, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, dst.id, runId, f.reference, f.title, f.description, f.finding_type, f.relationship_explanation, f.uncertainty, f.review_status, f.superseded, f.version, f.created_at, f.updated_at,
      );
      for (const s of all<Record<string, string>>("SELECT * FROM finding_sources WHERE finding_id = ?", f.id as string)) {
        const o = obsMap.get(s.observation_id);
        const ev = evMap.get(s.evidence_id);
        if (o && ev) run("INSERT INTO finding_sources (id, finding_id, observation_id, evidence_id, source_reference) VALUES (?, ?, ?, ?, ?)", crypto.randomUUID(), id, o, ev, s.source_reference);
      }
      for (const rv of all<Record<string, string | null>>("SELECT * FROM finding_reviews WHERE finding_id = ?", f.id as string)) {
        run(
          "INSERT INTO finding_reviews (id, finding_id, reviewer_id, action, previous_content, updated_content, review_note, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(), id, rv.reviewer_id, rv.action, rv.previous_content, rv.updated_content, rv.review_note, rv.reviewed_at,
        );
      }
    }
    for (const c of all<Record<string, string | null>>("SELECT * FROM chronology_events WHERE case_id = ?", caseId)) {
      const runId = runMap.get(c.analysis_run_id as string);
      if (!runId) continue;
      const obs = parseJson<string[]>(c.observation_ids, []).map((o) => obsMap.get(o)).filter(Boolean);
      const evs = parseJson<string[]>(c.evidence_ids, []).map((e) => evMap.get(e)).filter(Boolean);
      run(
        "INSERT INTO chronology_events (id, case_id, analysis_run_id, description, event_datetime, date_text, time_precision, observation_ids, evidence_ids, relationship_note, review_status, superseded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(), dst.id, runId, c.description, c.event_datetime, c.date_text, c.time_precision, JSON.stringify(obs), JSON.stringify(evs), c.relationship_note, c.review_status, c.superseded, c.created_at,
      );
    }
    for (const r of all<{ evidence_id: string; level: string; report: string; created_at: string }>("SELECT evidence_id, level, report, created_at FROM integrity_reports WHERE case_id = ?", caseId)) {
      const ev = evMap.get(r.evidence_id);
      if (!ev) continue;
      const rep = parseJson<Record<string, unknown>>(r.report, {});
      run("INSERT INTO integrity_reports (id, evidence_id, case_id, level, report, created_at) VALUES (?, ?, ?, ?, ?, ?)", crypto.randomUUID(), ev, dst.id, r.level, JSON.stringify({ ...rep, evidence_id: ev }), r.created_at);
    }
    // Keep reference counters in step so new items continue the sequence.
    run("UPDATE cases SET evidence_seq = ?, observation_seq = ?, finding_seq = ? WHERE id = ?", meta.evidence_seq, meta.observation_seq, meta.finding_seq, dst.id);
  });

  postMessage(dst.id, "assistant", { text: `This case was branched from ${src.reference} · ${src.title.replace(/^DEMO · /, "")}. Evidence, observations, findings and the chronology were copied; changes here won't affect the original.` }, null);
  return { caseId: dst.id };
}
