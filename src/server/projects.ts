import crypto from "node:crypto";
import { all, get, now, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { caseSummary, type CaseRow } from "./cases";

// Projects are folders of related cases. Removing a project leaves its cases intact.
// A private project is visible only to the person who created it.

export type Visibility = "private" | "public";
const VISIBLE = "(p.visibility = 'public' OR p.created_by = ?)";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function listProjects(user: User) {
  return all<ProjectRow & { cases: number; evidence: number }>(
    `SELECT p.id, p.name, p.description, p.visibility, p.created_by, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM cases c WHERE c.project_id = p.id AND c.deleted_at IS NULL) cases,
            (SELECT COUNT(*) FROM evidence e JOIN cases c ON c.id = e.case_id WHERE c.project_id = p.id AND c.deleted_at IS NULL) evidence
       FROM projects p WHERE p.organisation_id = ? AND ${VISIBLE} ORDER BY p.updated_at DESC`,
    user.organisation_id,
    user.id,
  );
}

function getProjectRow(user: User, id: string) {
  const p = get<ProjectRow>(`SELECT p.id, p.name, p.description, p.visibility, p.created_by, p.created_at, p.updated_at FROM projects p WHERE p.id = ? AND p.organisation_id = ? AND ${VISIBLE}`, id, user.organisation_id, user.id);
  if (!p) throw new HttpError(404, "Project not found");
  return p;
}

export function getProject(user: User, id: string) {
  const p = getProjectRow(user, id);
  const cases = all<CaseRow>("SELECT * FROM cases WHERE project_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC", id).map(caseSummary);
  return { ...p, cases };
}

/** Create a project, optionally moving cases into it (e.g. one case dragged onto another). */
export function createProject(user: User, name: string, description: string, caseIds: string[] = [], visibility: Visibility = "public") {
  const id = crypto.randomUUID();
  const ts = now();
  tx(() => {
    run("INSERT INTO projects (id, organisation_id, name, description, visibility, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, user.organisation_id, name.trim(), description.trim(), visibility, user.id, ts, ts);
    for (const c of caseIds) {
      // Only cases in the user's own organisation can be moved.
      if (!get("SELECT id FROM cases WHERE id = ? AND organisation_id = ? AND kind = 'case' AND deleted_at IS NULL", c, user.organisation_id)) throw new HttpError(404, "Case not found");
      run("UPDATE cases SET project_id = ? WHERE id = ?", id, c);
    }
  });
  return getProjectRow(user, id);
}

export function updateProject(user: User, id: string, patch: { name?: string; description?: string; visibility?: Visibility }) {
  const p = getProjectRow(user, id);
  // Only the creator can change who sees a project.
  if (patch.visibility && patch.visibility !== p.visibility && p.created_by !== user.id) throw new HttpError(403, "Only the person who created this project can change its visibility");
  run("UPDATE projects SET name = ?, description = ?, visibility = ?, updated_at = ? WHERE id = ?", patch.name?.trim() || p.name, patch.description ?? p.description, patch.visibility ?? p.visibility, now(), id);
  return getProjectRow(user, id);
}

export function deleteProject(user: User, id: string) {
  getProjectRow(user, id);
  run("UPDATE cases SET project_id = NULL WHERE project_id = ?", id);
  run("DELETE FROM projects WHERE id = ?", id);
}
