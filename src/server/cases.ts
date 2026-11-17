import crypto from "node:crypto";
import { isTemplateKey } from "@/lib/canvasTemplates";
import { all, get, now, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { removeCaseFiles } from "./storage";
import type { CaseStatus } from "@/lib/types";

export interface CaseRow {
  id: string;
  organisation_id: string;
  reference: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_demo?: number;
  industry?: string | null;
  pinned?: number;
  project_id?: string | null;
  archived?: number;
  summary?: string | null;
  summary_source?: string | null;
  created_by?: string | null;
  access?: "workspace" | "invited";
  case_type?: string | null;
  canvas_template?: string | null;
  kind?: "case" | "folder";
  /** Folders: the folder this one sits in. */
  parent_id?: string | null;
  /** Folders: the case this is the vault folder of, if any. */
  case_id?: string | null;
}

export interface CaseStateCounts {
  evidence: number;
  evidenceFailed: number;
  activeJobs: number;
  completedCaseRuns: number;
  latestCaseRunFailed: boolean;
  activeFindings: number;
  unreviewedFindings: number;
}

/**
 * Case status is derived from real processing and review state; it is never
 * stored or set cosmetically.
 */
export function deriveCaseStatus(c: CaseStateCounts): CaseStatus {
  if (c.activeJobs > 0) return "analysis_in_progress";
  if (c.evidenceFailed > 0 || c.latestCaseRunFailed) return "error";
  if (c.evidence === 0) return "created";
  if (c.completedCaseRuns === 0) return "evidence_uploaded";
  if (c.unreviewedFindings > 0) return "ready_for_review";
  return "reviewed";
}

export function caseCounts(caseId: string): CaseStateCounts & { findingsTotal: number } {
  const n = (sql: string) => Number(get<{ n: number }>(sql, caseId)?.n ?? 0);
  const latest = get<{ status: string }>(
    "SELECT status FROM analysis_runs WHERE case_id = ? AND scope = 'case' ORDER BY created_at DESC LIMIT 1",
    caseId,
  );
  const activeFindings = n("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL");
  return {
    evidence: n("SELECT COUNT(*) n FROM evidence WHERE case_id = ?"),
    evidenceFailed: n("SELECT COUNT(*) n FROM evidence WHERE case_id = ? AND processing_status = 'failed'"),
    activeJobs: n("SELECT COUNT(*) n FROM analysis_runs WHERE case_id = ? AND status IN ('queued','running')"),
    completedCaseRuns: n("SELECT COUNT(*) n FROM analysis_runs WHERE case_id = ? AND scope = 'case' AND status = 'completed'"),
    latestCaseRunFailed: latest?.status === "failed",
    activeFindings,
    findingsTotal: activeFindings,
    unreviewedFindings: n(
      "SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status = 'unreviewed'",
    ),
  };
}

export function caseSummary(c: CaseRow) {
  const counts = caseCounts(c.id);
  return {
    ...c,
    is_demo: !!c.is_demo,
    pinned: !!c.pinned,
    archived: !!c.archived,
    status: deriveCaseStatus(counts),
    evidence_count: counts.evidence,
    findings_count: counts.activeFindings,
    findings_needing_review: counts.unreviewedFindings,
    // Veyra is working on this case: analysis, a workflow or an integrity check is queued or running.
    busy:
      counts.activeJobs > 0 ||
      !!get("SELECT 1 FROM workflow_runs WHERE case_id = ? AND status IN ('queued','running') LIMIT 1", c.id) ||
      !!get(
        "SELECT 1 FROM jobs j WHERE j.kind = 'check_integrity' AND j.status IN ('queued','running') AND EXISTS (SELECT 1 FROM evidence e WHERE e.case_id = ? AND j.payload LIKE '%' || e.id || '%') LIMIT 1",
        c.id,
      ),
  };
}

/**
 * Whether the user may open a case (as table alias c): open to the workspace,
 * or limited to invited people and the user is an admin, its owner or a member.
 * Takes three parameters: is-admin (1/0), the user's id, the user's id again.
 */
const CAN_OPEN = `(c.access = 'workspace' OR ? = 1 OR c.created_by = ? OR EXISTS (SELECT 1 FROM case_members m WHERE m.case_id = c.id AND m.user_id = ?))`;

export function listCases(user: User) {
  return all<CaseRow>(
    `SELECT * FROM cases c WHERE organisation_id = ? AND kind = 'case' AND deleted_at IS NULL AND ${CAN_OPEN} ORDER BY pinned DESC, updated_at DESC`,
    user.organisation_id,
    user.role === "admin" ? 1 : 0,
    user.id,
    user.id,
  ).map(caseSummary);
}

/**
 * Every case access goes through here, enforcing organisation isolation. Vault
 * folders are stored as cases too, so this also returns folders; use `kind` to
 * require one or the other.
 */
export function getCaseForUser(user: User, caseId: string, kind?: "case" | "folder"): CaseRow {
  const c = get<CaseRow>(
    `SELECT * FROM cases c WHERE id = ? AND organisation_id = ? AND deleted_at IS NULL AND ${CAN_OPEN}`,
    caseId,
    user.organisation_id,
    user.role === "admin" ? 1 : 0,
    user.id,
    user.id,
  );
  if (!c || (kind && c.kind !== kind)) throw new HttpError(404, kind === "folder" ? "Folder not found" : "Case not found");
  return c;
}

/** Days a deleted case stays in the trash before it is erased. */
export const TRASH_DAYS = 30;

function getTrashedCase(user: User, caseId: string): CaseRow & { legal_hold: number } {
  const c = get<CaseRow & { legal_hold: number }>("SELECT * FROM cases WHERE id = ? AND organisation_id = ? AND deleted_at IS NOT NULL", caseId, user.organisation_id);
  if (!c) throw new HttpError(404, "Case not found in the trash");
  return c;
}

/** Move a case to the trash. Nothing is erased; it can be restored until it is purged. */
export function trashCase(user: User, caseId: string) {
  getCaseForUser(user, caseId);
  run("UPDATE cases SET deleted_at = ?, deleted_by = ?, pinned = 0 WHERE id = ?", now(), user.id, caseId);
}

export function restoreCase(user: User, caseId: string) {
  getTrashedCase(user, caseId);
  run("UPDATE cases SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?", now(), caseId);
  return getCaseForUser(user, caseId);
}

/** Cases in the trash, after erasing any past the retention window that are not on legal hold. */
export function listTrash(user: User) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400_000).toISOString();
  for (const c of all<{ id: string }>("SELECT id FROM cases WHERE organisation_id = ? AND deleted_at IS NOT NULL AND deleted_at < ? AND legal_hold = 0", user.organisation_id, cutoff)) {
    eraseCase(c.id);
  }
  return all<{ id: string; reference: string; title: string; deleted_at: string; deleted_by_name: string | null; legal_hold: number; files: number }>(
    `SELECT c.id, c.reference, c.title, c.deleted_at, u.name deleted_by_name, c.legal_hold,
            (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id) files
       FROM cases c LEFT JOIN users u ON u.id = c.deleted_by
      WHERE c.organisation_id = ? AND c.kind = 'case' AND c.deleted_at IS NOT NULL ORDER BY c.deleted_at DESC`,
    user.organisation_id,
  ).map((c) => ({ ...c, legal_hold: !!c.legal_hold, purge_at: new Date(Date.parse(c.deleted_at) + TRASH_DAYS * 86400_000).toISOString() }));
}

export function createCase(user: User, title: string, description: string): CaseRow {
  return tx(() => {
    const id = crypto.randomUUID();
    const count = Number(get<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE organisation_id = ? AND kind = 'case'", user.organisation_id)?.n ?? 0);
    const year = new Date().getFullYear();
    let seq = count + 1;
    let reference = `CASE-${year}-${String(seq).padStart(4, "0")}`;
    while (get("SELECT id FROM cases WHERE organisation_id = ? AND reference = ?", user.organisation_id, reference)) {
      seq += 1;
      reference = `CASE-${year}-${String(seq).padStart(4, "0")}`;
    }
    const ts = now();
    run(
      "INSERT INTO cases (id, organisation_id, reference, title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      user.organisation_id,
      reference,
      title,
      description,
      user.id,
      ts,
      ts,
    );
    return getCaseForUser(user, id);
  });
}

/**
 * A vault folder: a named place for original files. It can sit inside another
 * folder, and a top-level folder can be a case's own folder. Any case can use
 * files from any folder.
 */
export function createFolder(user: User, name: string, opts: { parentId?: string | null; caseId?: string | null } = {}): CaseRow {
  if (opts.parentId) getCaseForUser(user, opts.parentId, "folder");
  return tx(() => {
    const id = crypto.randomUUID();
    let seq = Number(get<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE organisation_id = ? AND kind = 'folder'", user.organisation_id)?.n ?? 0) + 1;
    while (get("SELECT id FROM cases WHERE organisation_id = ? AND reference = ?", user.organisation_id, `VAULT-${String(seq).padStart(4, "0")}`)) seq += 1;
    const ts = now();
    run(
      "INSERT INTO cases (id, organisation_id, reference, title, description, created_by, created_at, updated_at, kind, parent_id, case_id) VALUES (?, ?, ?, ?, '', ?, ?, ?, 'folder', ?, ?)",
      id,
      user.organisation_id,
      `VAULT-${String(seq).padStart(4, "0")}`,
      name.trim(),
      user.id,
      ts,
      ts,
      opts.parentId ?? null,
      opts.parentId ? null : opts.caseId ?? null,
    );
    return getCaseForUser(user, id, "folder");
  });
}

/** The case's own vault folder, if it has one yet. */
export function findCaseFolder(user: User, caseId: string): CaseRow | undefined {
  return get<CaseRow>(
    "SELECT * FROM cases WHERE organisation_id = ? AND kind = 'folder' AND case_id = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
    user.organisation_id,
    caseId,
  );
}

/** The case's own vault folder, created on first use with the case's name (it can be renamed later). */
export function caseFolder(user: User, caseId: string): CaseRow {
  const c = getCaseForUser(user, caseId, "case");
  return findCaseFolder(user, caseId) ?? createFolder(user, c.title, { caseId });
}

export function updateCase(user: User, caseId: string, patch: { title?: string; description?: string; pinned?: boolean; project_id?: string | null; archived?: boolean; industry?: string | null; canvas_template?: string | null }) {
  const c = getCaseForUser(user, caseId);
  if (patch.canvas_template !== undefined) {
    if (patch.canvas_template && !isTemplateKey(patch.canvas_template)) throw new HttpError(400, "Unknown template");
    run("UPDATE cases SET canvas_template = ? WHERE id = ?", patch.canvas_template, caseId);
  }
  if (patch.industry !== undefined) run("UPDATE cases SET industry = ? WHERE id = ?", patch.industry?.trim() || null, caseId);
  if (patch.pinned !== undefined) run("UPDATE cases SET pinned = ? WHERE id = ?", patch.pinned ? 1 : 0, caseId);
  if (patch.archived !== undefined) run("UPDATE cases SET archived = ? WHERE id = ?", patch.archived ? 1 : 0, caseId);
  if (patch.project_id !== undefined) {
    if (patch.project_id && !get("SELECT id FROM projects WHERE id = ? AND organisation_id = ?", patch.project_id, user.organisation_id)) throw new HttpError(404, "Project not found");
    run("UPDATE cases SET project_id = ? WHERE id = ?", patch.project_id, caseId);
  }
  run(
    "UPDATE cases SET title = ?, description = ?, updated_at = ? WHERE id = ?",
    patch.title ?? c.title,
    patch.description ?? c.description,
    now(),
    caseId,
  );
  return getCaseForUser(user, caseId);
}

/**
 * Permanent deletion, from the trash only: removes the case record, all derived
 * data and the stored originals. A case on legal hold cannot be erased.
 */
export function deleteCase(user: User, caseId: string, confirmReference: string) {
  const c = getTrashedCase(user, caseId);
  if (confirmReference !== c.reference) {
    throw new HttpError(400, `Type the case reference (${c.reference}) to confirm deletion`);
  }
  if (c.legal_hold) throw new HttpError(409, "This case is on legal hold and cannot be erased");
  eraseCase(caseId);
}

function eraseCase(caseId: string) {
  const rows = all<{ id: string; storage_reference: string }>("SELECT id, storage_reference FROM evidence WHERE case_id = ?", caseId);
  const evidenceIds = rows.map((r) => r.id);
  tx(() => {
    run("DELETE FROM case_messages WHERE case_id = ?", caseId);
    run("DELETE FROM workflow_runs WHERE case_id = ?", caseId);
    run("DELETE FROM integrity_reports WHERE case_id = ?", caseId);
    run("DELETE FROM upload_invites WHERE case_id = ?", caseId);
    run("DELETE FROM case_packs WHERE case_id = ?", caseId);
    run("DELETE FROM chronology_events WHERE case_id = ?", caseId);
    run("DELETE FROM finding_reviews WHERE finding_id IN (SELECT id FROM findings WHERE case_id = ?)", caseId);
    run("DELETE FROM finding_sources WHERE finding_id IN (SELECT id FROM findings WHERE case_id = ?)", caseId);
    run("DELETE FROM findings WHERE case_id = ?", caseId);
    run("DELETE FROM observations WHERE case_id = ?", caseId);
    run("DELETE FROM extractions WHERE evidence_id IN (SELECT id FROM evidence WHERE case_id = ?)", caseId);
    run("UPDATE evidence SET duplicate_of = NULL WHERE case_id = ?", caseId);
    // A case folder outlives its case as an ordinary folder; subfolders of an erased folder move up.
    run("UPDATE cases SET case_id = NULL WHERE case_id = ?", caseId);
    run("UPDATE cases SET parent_id = NULL WHERE parent_id = ?", caseId);
    // Cases keep their own copy of a vault file's record; only the link back is dropped.
    run("UPDATE evidence SET vault_item_id = NULL WHERE vault_item_id IN (SELECT id FROM evidence WHERE case_id = ?)", caseId);
    run("DELETE FROM analysis_runs WHERE case_id = ?", caseId);
    run("DELETE FROM evidence WHERE case_id = ?", caseId);
    for (const t of ["section_assignments", "web_sources", "task_views"]) run(`DELETE FROM ${t} WHERE case_id = ?`, caseId);
    run("DELETE FROM cases WHERE id = ?", caseId);
  });
  // Originals are shared between a vault folder and the cases using its files: keep any still in use.
  const inUse = new Set(rows.filter((r) => get("SELECT 1 FROM evidence WHERE storage_reference = ?", r.storage_reference)).map((r) => r.storage_reference));
  removeCaseFiles(caseId, evidenceIds, inUse);
}

export function touchCase(caseId: string) {
  run("UPDATE cases SET updated_at = ? WHERE id = ?", now(), caseId);
}

/** Allocate the next per-case reference (EVD-001, OBS-001, FND-001). */
export function nextReference(caseId: string, kind: "evidence" | "observation" | "finding"): string {
  const col = { evidence: "evidence_seq", observation: "observation_seq", finding: "finding_seq" }[kind];
  const prefix = { evidence: "EVD", observation: "OBS", finding: "FND" }[kind];
  run(`UPDATE cases SET ${col} = ${col} + 1 WHERE id = ?`, caseId);
  const seq = Number(get<{ s: number }>(`SELECT ${col} s FROM cases WHERE id = ?`, caseId)?.s);
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
