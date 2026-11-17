import crypto from "node:crypto";
import { all, now, parseJson, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, listCases } from "./cases";
import { caseIntegrity } from "./analysis/integrity";
import { PACK_SECTIONS, type SectionKey } from "@/lib/sections";
import { sectionLabel } from "./collab";

// The case's task strip: everything that needs a person, derived from real
// state (nothing here is stored except custom views).

export const TASK_KINDS = {
  review_request: "Section review requests",
  finding_review: "Findings to review",
  web_approval: "Web sources to approve",
  integrity: "Integrity indicators",
  processing: "Processing",
  failed: "Failed processing",
  not_analysed: "Not analysed",
} as const;
export type TaskKind = keyof typeof TASK_KINDS;

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  target: { view?: string; params?: Record<string, string>; section?: string };
  /** Who it's with, when someone has been asked to do it. */
  assignee?: string | null;
}

export const BUILT_IN_VIEWS: { id: string; name: string; kinds: TaskKind[] }[] = [
  { id: "all", name: "All", kinds: Object.keys(TASK_KINDS) as TaskKind[] },
  { id: "human", name: "Needs human review", kinds: ["review_request", "finding_review"] },
  { id: "approval", name: "Awaiting approval", kinds: ["web_approval"] },
  { id: "evidence", name: "Evidence", kinds: ["integrity", "processing", "failed", "not_analysed"] },
];

export function caseTasks(user: User, caseId: string): Task[] {
  getCaseForUser(user, caseId);
  const tasks: Task[] = [];
  for (const a of all<{ id: string; section: string; assignee: string; note: string }>("SELECT id, section, assignee, note FROM section_assignments WHERE case_id = ? AND status = 'open' ORDER BY created_at", caseId)) {
    tasks.push({ id: `a:${a.id}`, kind: "review_request", title: `Review ${sectionLabel(caseId, a.section) ?? a.section}`, detail: a.note, target: { section: a.section }, assignee: a.assignee });
  }
  for (const w of all<{ id: string; section: SectionKey; title: string }>("SELECT id, section, title FROM web_sources WHERE case_id = ? AND status = 'proposed' ORDER BY retrieved_at", caseId)) {
    tasks.push({ id: `w:${w.id}`, kind: "web_approval", title: w.title, detail: `For ${PACK_SECTIONS[w.section]}`, target: { section: w.section } });
  }
  for (const f of all<{ id: string; reference: string; title: string }>("SELECT id, reference, title FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status = 'unreviewed' ORDER BY reference", caseId)) {
    tasks.push({ id: `f:${f.id}`, kind: "finding_review", title: f.title, detail: "", target: { view: "insights", params: { f: f.id } } });
  }
  const integrity = caseIntegrity(caseId);
  for (const e of all<{ id: string; original_filename: string; processing_status: string; processing_error: string | null }>("SELECT id, original_filename, processing_status, processing_error FROM evidence WHERE case_id = ? ORDER BY reference", caseId)) {
    const target = { view: "evidence", params: { e: e.id } };
    const r = integrity.get(e.id);
    if (r && (r.level === "indicator" || r.level === "strong" || r.level === "critical")) {
      tasks.push({ id: `i:${e.id}`, kind: "integrity", title: e.original_filename, detail: r.indicators.filter((i) => i.level !== "info").map((i) => i.title).join(" · "), target });
    }
    if (e.processing_status === "queued" || e.processing_status === "processing") tasks.push({ id: `p:${e.id}`, kind: "processing", title: e.original_filename, detail: "Being analysed", target });
    else if (e.processing_status === "failed") tasks.push({ id: `x:${e.id}`, kind: "failed", title: e.original_filename, detail: e.processing_error ?? "Processing failed", target });
    else if (e.processing_status === "pending") tasks.push({ id: `n:${e.id}`, kind: "not_analysed", title: e.original_filename, detail: "Not analysed yet", target });
  }
  return tasks;
}

/**
 * Everything waiting on this person across their open cases, for the Tasks sheet
 * in the sidebar. Evidence still being processed is left out: it needs no one yet.
 */
export function myTasks(user: User) {
  const groups: { case_id: string; case_title: string; tasks: Task[] }[] = [];
  for (const c of listCases(user).filter((c) => !c.archived)) {
    const tasks = caseTasks(user, c.id).filter((t) => t.kind !== "processing");
    if (tasks.length) groups.push({ case_id: c.id, case_title: c.title.replace(/^DEMO · /, ""), tasks });
  }
  return { groups, total: groups.reduce((n, g) => n + g.tasks.length, 0) };
}

export function listViews(user: User, caseId: string) {
  getCaseForUser(user, caseId);
  const custom = all<{ id: string; name: string; kinds: string }>("SELECT id, name, kinds FROM task_views WHERE case_id = ? ORDER BY created_at", caseId).map((v) => ({ id: v.id, name: v.name, kinds: parseJson<TaskKind[]>(v.kinds, []), custom: true }));
  return [...BUILT_IN_VIEWS.map((v) => ({ ...v, custom: false })), ...custom];
}

export function createView(user: User, caseId: string, name: string, kinds: string[]) {
  getCaseForUser(user, caseId);
  const valid = kinds.filter((k): k is TaskKind => k in TASK_KINDS);
  if (!name.trim()) throw new HttpError(400, "Name the view");
  if (!valid.length) throw new HttpError(400, "Choose at least one kind of task");
  const id = crypto.randomUUID();
  run("INSERT INTO task_views (id, case_id, name, kinds, created_at) VALUES (?, ?, ?, ?, ?)", id, caseId, name.trim().slice(0, 60), JSON.stringify(valid), now());
  return id;
}

export function deleteView(user: User, caseId: string, id: string) {
  getCaseForUser(user, caseId);
  run("DELETE FROM task_views WHERE id = ? AND case_id = ?", id, caseId);
}
