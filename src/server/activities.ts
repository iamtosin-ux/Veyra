import crypto from "node:crypto";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { activityKind } from "@/lib/activities";

/** Case activity: filings, hearings, police attendance and the like, recorded by people. */

export interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  details: string | null;
  occurred_at: string | null;
  position: number | null;
  created_at: string;
  added_by_name: string | null;
}

export function activityRows(caseId: string): ActivityRow[] {
  return all<ActivityRow>(
    "SELECT a.id, a.kind, a.title, a.details, a.occurred_at, a.position, a.created_at, u.name added_by_name FROM case_activities a LEFT JOIN users u ON u.id = a.created_by WHERE a.case_id = ?",
    caseId,
  );
}

/** Date as YYYY-MM-DD, optionally with THH:MM. */
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export function addActivity(user: User, caseId: string, input: { kind: string; title?: string | null; details?: string | null; occurred_at?: string | null }) {
  getCaseForUser(user, caseId, "case");
  const kind = activityKind(input.kind);
  if (!kind) throw new HttpError(400, "Unknown kind of activity");
  const when = input.occurred_at?.trim() || null;
  if (when && !DATE.test(when)) throw new HttpError(400, "Give the date as YYYY-MM-DD, with an optional time");
  const title = input.title?.trim() || kind.label;
  const id = crypto.randomUUID();
  run(
    "INSERT INTO case_activities (id, case_id, kind, title, details, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id, caseId, kind.key, title.slice(0, 300), input.details?.trim().slice(0, 4000) || null, when, user.id, now(),
  );
  touchCase(caseId);
  return id;
}

export function removeActivity(user: User, caseId: string, id: string) {
  getCaseForUser(user, caseId, "case");
  if (!get("SELECT 1 FROM case_activities WHERE id = ? AND case_id = ?", id, caseId)) throw new HttpError(404, "Activity not found");
  run("DELETE FROM case_activities WHERE id = ?", id);
  touchCase(caseId);
}
