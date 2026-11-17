import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { enqueueJob } from "./jobs";
import { isDemoCase } from "./evidence";
import { processEvidenceRun } from "./analysis/evidencePipeline";
import { analyseCaseRun } from "./analysis/caseAnalysis";
import { checkEvidenceIntegrity, type IntegrityReport } from "./analysis/integrity";
import { reviewCase, type CaseReviewReport } from "./analysis/caseReview";
import { demoCaseAnalyser, demoEvidenceAnalyser } from "./demo/demo";
import { postMessage, type MessageContent } from "./assistant/assistant";
import { resolveRefs } from "./assistant/knowledge";
import { ComplianceBlockedError, authorise } from "./compliance/engine";

// Workflows are saved, reusable sequences of skills a user deploys on a case
// with a prompt. Each run is executed by the background worker and reports
// back into the case conversation.

export const STEPS = {
  extract: { label: "Extract observations", description: "Process every evidence item not yet analysed into source-linked observations." },
  integrity: { label: "Check integrity and AI generation", description: "Verify originals are unchanged and look for editing, re-encoding and AI-generation indicators in file metadata." },
  compare: { label: "Cross-evidence insights", description: "Compare observations across items to find supporting links, discrepancies, a chronology and open questions." },
  review: { label: "Case validity review", description: "Check the case for issues that could undermine it: integrity concerns, untraceable findings, unresolved conflicts and review gaps." },
} as const;
export type StepKey = keyof typeof STEPS;
export const STEP_KEYS = Object.keys(STEPS) as StepKey[];

export interface WorkflowRow {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  kind: "analyse" | "review" | "custom";
  steps: string;
  instructions: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export function publicWorkflow(w: WorkflowRow) {
  return { ...w, is_default: !!w.is_default, steps: parseJson<StepKey[]>(w.steps, []) };
}

/** Each organisation starts with the two built-in workflows. */
export function ensureDefaultWorkflows(orgId: string) {
  if (get("SELECT id FROM workflows WHERE organisation_id = ? AND is_default = 1 LIMIT 1", orgId)) return;
  const ts = now();
  const add = (name: string, description: string, kind: "analyse" | "review", steps: StepKey[], instructions: string) =>
    run(
      "INSERT INTO workflows (id, organisation_id, name, description, kind, steps, instructions, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      crypto.randomUUID(),
      orgId,
      name,
      description,
      kind,
      JSON.stringify(steps),
      instructions,
      ts,
      ts,
    );
  add("Analyse evidence", "Pull out observations and insights from a body of evidence, and check every item for tampering or AI generation.", "analyse", ["extract", "integrity", "compare"], "Focus on what each item shows, where accounts conflict, and anything suggesting an item has been altered or generated.");
  add("Case validity review", "Check a case you've been given for errors or gaps that could invalidate it.", "review", ["integrity", "review"], "Flag anything that would undermine reliance on this case record.");
}

export function listWorkflows(user: User) {
  ensureDefaultWorkflows(user.organisation_id);
  return all<WorkflowRow & { created_by_name: string | null }>(
    "SELECT w.*, u.name created_by_name FROM workflows w LEFT JOIN users u ON u.id = w.created_by WHERE w.organisation_id = ? ORDER BY w.is_default DESC, w.updated_at DESC",
    user.organisation_id,
  ).map((w) => ({ ...publicWorkflow(w), created_by_name: w.created_by_name }));
}

export function getWorkflow(user: User, id: string) {
  const w = get<WorkflowRow>("SELECT * FROM workflows WHERE id = ? AND organisation_id = ?", id, user.organisation_id);
  if (!w) throw new HttpError(404, "Workflow not found");
  return w;
}

export function defaultWorkflow(user: User, kind: "analyse" | "review") {
  ensureDefaultWorkflows(user.organisation_id);
  return publicWorkflow(get<WorkflowRow>("SELECT * FROM workflows WHERE organisation_id = ? AND is_default = 1 AND kind = ?", user.organisation_id, kind)!);
}

function cleanSteps(steps: string[]): StepKey[] {
  const valid = steps.filter((s): s is StepKey => (STEP_KEYS as string[]).includes(s));
  // Keep a sensible execution order regardless of how they were picked.
  return STEP_KEYS.filter((k) => valid.includes(k));
}

export function saveWorkflow(user: User, input: { id?: string; name: string; description: string; steps: string[]; instructions: string }) {
  const steps = cleanSteps(input.steps);
  if (!steps.length) throw new HttpError(400, "Choose at least one step");
  const kind = steps.includes("extract") || steps.includes("compare") ? "analyse" : steps.includes("review") ? "review" : "custom";
  const ts = now();
  if (input.id) {
    const existing = getWorkflow(user, input.id);
    // Built-in workflows keep their kind so Analyse and Review always find them.
    run(
      "UPDATE workflows SET name = ?, description = ?, kind = ?, steps = ?, instructions = ?, updated_at = ? WHERE id = ?",
      input.name,
      input.description,
      existing.is_default ? existing.kind : kind,
      JSON.stringify(steps),
      input.instructions,
      ts,
      input.id,
    );
    return publicWorkflow(getWorkflow(user, input.id));
  }
  const id = crypto.randomUUID();
  run(
    "INSERT INTO workflows (id, organisation_id, name, description, kind, steps, instructions, is_default, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    id,
    user.organisation_id,
    input.name,
    input.description,
    kind,
    JSON.stringify(steps),
    input.instructions,
    user.id,
    ts,
    ts,
  );
  return publicWorkflow(getWorkflow(user, id));
}

export function deleteWorkflow(user: User, id: string) {
  const w = getWorkflow(user, id);
  if (w.is_default) throw new HttpError(400, "Built-in workflows can't be deleted");
  run("DELETE FROM workflows WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Runs

interface StepState {
  key: StepKey;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  detail: string | null;
}

export function startWorkflowRun(user: User, workflowId: string, caseId: string, prompt: string, opts: { steps?: string[]; announce?: boolean } = {}) {
  getCaseForUser(user, caseId);
  const saved = publicWorkflow(getWorkflow(user, workflowId));
  // An approved plan may leave steps out; the rest keep the workflow's order.
  const w = opts.steps ? { ...saved, steps: saved.steps.filter((k) => opts.steps!.includes(k)) } : saved;
  if (!w.steps.length) throw new HttpError(400, "Keep at least one step");
  if (get("SELECT id FROM workflow_runs WHERE case_id = ? AND status IN ('queued','running')", caseId)) throw new HttpError(409, "A workflow is already running on this case");
  // Refuse at the start, with the reason, when the policy doesn't allow the analysis this workflow does.
  const provider = isDemoCase(caseId) ? null : "anthropic";
  if (w.steps.includes("extract")) authorise({ operation: "observations", provider, organisationId: user.organisation_id, caseId, user });
  if (w.steps.includes("compare")) authorise({ operation: "cross_evidence", provider, organisationId: user.organisation_id, caseId, user });
  const steps: StepState[] = w.steps.map((k) => ({ key: k, label: STEPS[k].label, status: "pending", detail: null }));
  const id = crypto.randomUUID();
  run(
    "INSERT INTO workflow_runs (id, workflow_id, case_id, prompt, status, steps, created_by, created_at) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)",
    id,
    w.id,
    caseId,
    prompt.trim(),
    JSON.stringify(steps),
    user.id,
    now(),
  );
  if (prompt.trim()) postMessage(caseId, "user", { text: prompt.trim() }, user.id);
  if (opts.announce !== false) postMessage(caseId, "assistant", { text: `Running **${w.name}**.`, workflowRunId: id }, null);
  enqueueJob("run_workflow", { workflowRunId: id });
  touchCase(caseId);
  return id;
}

/** Approve, dismiss or restore a plan Veyra proposed in the conversation. */
export function decidePlan(user: User, caseId: string, messageId: string, decision: "approve" | "dismiss" | "restore", steps?: string[]) {
  getCaseForUser(user, caseId);
  const m = get<{ content: string }>("SELECT content FROM case_messages WHERE id = ? AND case_id = ? AND role = 'assistant'", messageId, caseId);
  const content = parseJson<MessageContent>(m?.content, { text: "" });
  const plan = content.plan;
  if (!m || !plan) throw new HttpError(404, "Plan not found");
  if (decision === "restore") {
    if (plan.status !== "dismissed") throw new HttpError(409, "Only a dismissed plan can be restored");
    content.plan = { ...plan, status: "proposed" };
  } else {
    if (plan.status !== "proposed") throw new HttpError(409, plan.status === "approved" ? "This plan is already running" : "This plan was dismissed");
    if (decision === "dismiss") content.plan = { ...plan, status: "dismissed" };
    else {
      const selected = cleanSteps(steps ?? plan.steps.map((s) => s.key));
      if (!selected.length) throw new HttpError(400, "Keep at least one step");
      const runId = startWorkflowRun(user, plan.workflowId, caseId, "", { steps: selected, announce: false });
      content.plan = { ...plan, status: "approved", selected, runId };
    }
  }
  run("UPDATE case_messages SET content = ? WHERE id = ?", JSON.stringify(content), messageId);
  touchCase(caseId);
  return content.plan;
}

export function getWorkflowRun(user: User, id: string) {
  const r = get<{ id: string; workflow_id: string; case_id: string; prompt: string; status: string; steps: string; result: string | null; error: string | null; created_at: string; finished_at: string | null }>(
    "SELECT * FROM workflow_runs WHERE id = ?",
    id,
  );
  if (!r) throw new HttpError(404, "Run not found");
  getCaseForUser(user, r.case_id);
  const w = get<{ name: string; instructions: string }>("SELECT name, instructions FROM workflows WHERE id = ?", r.workflow_id);
  return { ...r, workflow_name: w?.name ?? "Workflow", workflow_instructions: w?.instructions || null, steps: parseJson<StepState[]>(r.steps, []), result: parseJson<Record<string, unknown> | null>(r.result, null) };
}

/** Worker: execute every step in order, recording progress for the live card. */
export async function executeWorkflowRun(runId: string, heartbeat: () => void) {
  const r = get<{ id: string; workflow_id: string; case_id: string; prompt: string; steps: string; created_by: string | null }>("SELECT * FROM workflow_runs WHERE id = ?", runId);
  if (!r) throw new Error("Workflow run not found");
  const w = get<WorkflowRow>("SELECT * FROM workflows WHERE id = ?", r.workflow_id);
  const steps = parseJson<StepState[]>(r.steps, []);
  const caseId = r.case_id;
  const demo = isDemoCase(caseId);
  const focus = [w?.instructions, r.prompt].filter(Boolean).join("\n");
  const result: { extract?: { processed: number; failed: number; blocked?: { id: string; reason: string }[] }; integrity?: Record<string, number>; compare?: { findings: number; discrepancies: number }; review?: CaseReviewReport; reports?: Record<string, IntegrityReport> } = {};

  const save = (status = "running") => run("UPDATE workflow_runs SET status = ?, steps = ?, result = ? WHERE id = ?", status, JSON.stringify(steps), JSON.stringify(result), runId);
  save();

  for (const step of steps) {
    step.status = "running";
    save();
    heartbeat();
    try {
      if (step.key === "extract") {
        const pending = all<{ id: string; file_hash: string }>("SELECT id, file_hash FROM evidence WHERE case_id = ? AND processing_status IN ('pending','failed')", caseId);
        let failed = 0;
        const blocked: { id: string; reason: string }[] = [];
        for (const e of pending) {
          const arId = crypto.randomUUID();
          run("INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, evidence_hash, created_at) VALUES (?, ?, ?, 'evidence', 'queued', 'Queued', ?, ?)", arId, caseId, e.id, e.file_hash, now());
          run("UPDATE evidence SET processing_status = 'queued' WHERE id = ?", e.id);
          try {
            await processEvidenceRun(arId, heartbeat, demo ? demoEvidenceAnalyser : undefined);
          } catch (err) {
            // A policy block isn't a failure: the item is held back, with its reason, until someone resolves it.
            if (err instanceof ComplianceBlockedError) blocked.push({ id: e.id, reason: err.result.explanation });
            else failed++;
          }
          heartbeat();
        }
        const done = pending.length - failed - blocked.length;
        result.extract = { processed: done, failed, blocked };
        step.detail = pending.length
          ? [`${done} item(s) analysed`, failed ? `${failed} failed` : "", blocked.length ? `${blocked.length} held back by the processing policy` : ""].filter(Boolean).join(", ")
          : "All items were already analysed";
        if (failed && failed === pending.length) throw new Error(step.detail);
      } else if (step.key === "integrity") {
        const ev = all<{ id: string }>("SELECT id FROM evidence WHERE case_id = ?", caseId);
        const counts: Record<string, number> = { clear: 0, info: 0, indicator: 0, strong: 0, critical: 0 };
        result.reports = {};
        for (const e of ev) {
          const rep = await checkEvidenceIntegrity(e.id);
          counts[rep.level]++;
          result.reports[e.id] = rep;
          heartbeat();
        }
        result.integrity = counts;
        const flagged = counts.indicator + counts.strong + counts.critical;
        step.detail = `${ev.length} item(s) checked · ${flagged ? `${flagged} with indicators to review` : "no indicators beyond missing metadata"}`;
      } else if (step.key === "compare") {
        if (!get("SELECT id FROM observations WHERE case_id = ? AND superseded = 0 LIMIT 1", caseId)) {
          step.status = "skipped";
          step.detail = "No observations to compare yet";
          save();
          continue;
        }
        const arId = crypto.randomUUID();
        run("INSERT INTO analysis_runs (id, case_id, scope, status, stage, processing_configuration, created_at) VALUES (?, ?, 'case', 'queued', 'Queued', ?, ?)", arId, caseId, JSON.stringify({ focus }), now());
        await analyseCaseRun(arId, heartbeat, demo ? demoCaseAnalyser : undefined);
        const f = all<{ finding_type: string }>("SELECT finding_type FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL", caseId);
        result.compare = { findings: f.length, discrepancies: f.filter((x) => x.finding_type === "potential_discrepancy").length };
        step.detail = `${f.length} finding(s), ${result.compare.discrepancies} potential discrepanc${result.compare.discrepancies === 1 ? "y" : "ies"}`;
      } else if (step.key === "review") {
        const rep = reviewCase(caseId);
        result.review = rep;
        step.detail = rep.issues.length ? `${rep.summary.critical} critical, ${rep.summary.major} major, ${rep.summary.minor} minor` : "No issues found in the checks run";
      }
      step.status = "completed";
    } catch (e) {
      step.status = "failed";
      step.detail = e instanceof Error ? e.message : String(e);
    }
    save();
  }

  const text = summarise(caseId, w?.name ?? "Workflow", result);
  const checked = resolveRefs(caseId, text);
  postMessage(
    caseId,
    "assistant",
    {
      text: checked.text,
      refs: checked.refs,
      mode: "offline",
      actions: [
        ...(result.compare || result.review ? [{ kind: "open" as const, view: "insights" as const, label: "Open Insights" }] : []),
        { kind: "open" as const, view: "evidence" as const, label: "Open evidence" },
      ],
      packUpdate: [
        result.extract ? `Observations from ${result.extract.processed} item(s)` : null,
        result.integrity ? "Integrity indicators recorded per item" : null,
        result.compare ? `${result.compare.findings} findings and a chronology` : null,
      ].filter(Boolean) as string[],
    },
    null,
  );
  run("UPDATE workflow_runs SET status = ?, steps = ?, result = ?, finished_at = ? WHERE id = ?", steps.some((s) => s.status === "failed") ? "failed" : "completed", JSON.stringify(steps), JSON.stringify(result), now(), runId);
  touchCase(caseId);
}

function summarise(caseId: string, name: string, result: { extract?: { processed: number; failed: number; blocked?: { id: string; reason: string }[] }; integrity?: Record<string, number>; compare?: { findings: number; discrepancies: number }; review?: CaseReviewReport; reports?: Record<string, IntegrityReport> }) {
  const lines: string[] = [`**${name}** finished.`];
  const evRef = new Map(all<{ id: string; reference: string; original_filename: string }>("SELECT id, reference, original_filename FROM evidence WHERE case_id = ?", caseId).map((e) => [e.id, e]));
  if (result.extract) lines.push(`- Observations extracted from ${result.extract.processed} new item(s)${result.extract.failed ? `; ${result.extract.failed} failed` : ""}.`);
  for (const b of result.extract?.blocked ?? []) {
    const e = evRef.get(b.id);
    lines.push(`- Not analysed: ${e?.reference ?? ""} ${e?.original_filename ?? ""}. ${b.reason}`);
  }
  if (result.integrity && result.reports) {
    const flagged = Object.values(result.reports).filter((r) => r.level === "indicator" || r.level === "strong" || r.level === "critical");
    if (!flagged.length) lines.push("- Integrity: no editing, re-encoding or AI-generation indicators found in file metadata. (Absence of indicators does not prove authenticity.)");
    else {
      lines.push(`- Integrity: ${flagged.length} item(s) have indicators to review:`);
      for (const r of flagged.slice(0, 6)) {
        const e = evRef.get(r.evidence_id);
        const top = r.indicators.filter((i) => i.level !== "info").map((i) => i.title).join("; ");
        lines.push(`- ${e?.reference ?? ""} ${e?.original_filename ?? ""}: ${top}`);
      }
    }
  }
  if (result.compare) {
    lines.push(`- Insights: ${result.compare.findings} finding(s), including ${result.compare.discrepancies} potential discrepanc${result.compare.discrepancies === 1 ? "y" : "ies"}.`);
    const disc = all<{ reference: string; title: string }>("SELECT reference, title FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND finding_type = 'potential_discrepancy' ORDER BY reference LIMIT 3", caseId);
    for (const d of disc) lines.push(`- ${d.reference}: ${d.title}`);
  }
  if (result.review) {
    const r = result.review;
    if (!r.issues.length) lines.push("- Validity review: no issues found in the checks run.");
    else {
      lines.push(`- Validity review: ${r.summary.critical} critical, ${r.summary.major} major and ${r.summary.minor} minor issue(s).`);
      for (const i of r.issues.slice(0, 8)) lines.push(`- ${i.severity === "critical" ? "**Critical**" : i.severity === "major" ? "Major" : "Minor"}: ${i.title}${i.refs.length ? ` (${i.refs.slice(0, 3).join(", ")})` : ""}`);
      if (r.issues.length > 8) lines.push(`- …and ${r.issues.length - 8} more.`);
    }
  }
  lines.push("\nThese are checks and indicators for you to verify, not conclusions.");
  return lines.join("\n");
}
