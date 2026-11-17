import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { PACK_SECTIONS, isSectionKey } from "@/lib/sections";
import { postMessage } from "./assistant/assistant";

/**
 * The name of a section on a case's canvas: one of the built-in pack sections,
 * or "canvas:<id>" for a section added at the user's request. Null if unknown.
 */
export function sectionLabel(caseId: string, section: string): string | null {
  if (isSectionKey(section)) return PACK_SECTIONS[section];
  // A canvas template's checklist for the case type
  if (section === "checklist") return "Checklist";
  const m = section.match(/^canvas:([\w-]+)$/);
  if (!m) return null;
  return get<{ title: string }>("SELECT title FROM canvas_sections WHERE id = ? AND case_id = ?", m[1], caseId)?.title ?? null;
}

// Human-in-the-loop review requests on case pack sections. Veyra records who
// was asked; it does not send email or notifications yet.

export interface Assignment {
  id: string;
  section: string;
  assignee: string;
  assignee_kind: "person" | "team";
  note: string;
  status: "open" | "done";
  created_at: string;
  resolved_at: string | null;
  created_by_name: string | null;
}

/** People and teams in the organisation that can be tagged. */
export function directory(user: User) {
  const people = all<{ id: string; name: string; email: string; username: string | null }>("SELECT id, name, email, username FROM users WHERE organisation_id = ? ORDER BY name", user.organisation_id).map((u) => ({
    kind: "person" as const,
    id: u.id,
    name: u.name,
    detail: u.email.endsWith("@local.invalid") ? u.username ?? "" : u.email,
  }));
  // People tagged before by name (outside the workspace) are offered again.
  const named = all<{ assignee: string }>(
    "SELECT DISTINCT a.assignee FROM section_assignments a JOIN cases c ON c.id = a.case_id WHERE c.organisation_id = ? AND a.assignee_kind = 'person' AND a.assignee_user_id IS NULL",
    user.organisation_id,
  ).map((r) => ({ kind: "person" as const, id: null, name: r.assignee, detail: "Not a workspace member" }));
  const teams = all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE organisation_id = ? ORDER BY name", user.organisation_id).map((t) => ({ kind: "team" as const, id: t.id, name: t.name, detail: "Team" }));
  return [...people, ...named, ...teams];
}

export function listAssignments(user: User, caseId: string): Assignment[] {
  getCaseForUser(user, caseId);
  return all<Assignment>(
    `SELECT a.id, a.section, a.assignee, a.assignee_kind, a.note, a.status, a.created_at, a.resolved_at, u.name created_by_name
       FROM section_assignments a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.case_id = ? ORDER BY a.status, a.created_at DESC`,
    caseId,
  );
}

export function assignSection(user: User, caseId: string, input: { section: string; assignee: string; kind: "person" | "team"; note: string }) {
  const c = getCaseForUser(user, caseId);
  const label = sectionLabel(caseId, input.section);
  if (!label) throw new HttpError(400, "Unknown section");
  const name = input.assignee.trim();
  if (!name) throw new HttpError(400, "Choose a person or team");
  let userId: string | null = null;
  if (input.kind === "team") {
    // Tagging a new team name creates the team.
    if (!get("SELECT id FROM teams WHERE organisation_id = ? AND name = ? COLLATE NOCASE", user.organisation_id, name)) {
      run("INSERT INTO teams (id, organisation_id, name, created_at) VALUES (?, ?, ?, ?)", crypto.randomUUID(), user.organisation_id, name, now());
    }
  } else {
    userId = get<{ id: string }>("SELECT id FROM users WHERE organisation_id = ? AND name = ? COLLATE NOCASE", user.organisation_id, name)?.id ?? null;
  }
  const id = crypto.randomUUID();
  run(
    "INSERT INTO section_assignments (id, case_id, section, assignee, assignee_kind, assignee_user_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    caseId,
    input.section,
    name,
    input.kind,
    userId,
    input.note.trim(),
    user.id,
    now(),
  );
  touchCase(caseId);
  postMessage(c.id, "assistant", { text: `Assigned **${name}**${input.kind === "team" ? " (team)" : ""} to review and approve **${label}** as accurate.${input.note.trim() ? `\n\n“${input.note.trim()}”` : ""}` }, null);
  return id;
}

/** The reviewer asks for changes: recorded in the conversation; the request stays open until approved. */
export function requestChanges(user: User, caseId: string, id: string, note: string) {
  getCaseForUser(user, caseId);
  const a = get<{ section: string }>("SELECT section FROM section_assignments WHERE id = ? AND case_id = ?", id, caseId);
  if (!a) throw new HttpError(404, "Review request not found");
  postMessage(caseId, "assistant", { text: `Changes requested on **${sectionLabel(caseId, a.section) ?? a.section}** by ${user.name}.${note.trim() ? `\n\n“${note.trim()}”` : ""}` }, user.id);
}

export function setAssignmentStatus(user: User, caseId: string, id: string, status: "open" | "done") {
  getCaseForUser(user, caseId);
  const a = get<{ section: string; status: string }>("SELECT section, status FROM section_assignments WHERE id = ? AND case_id = ?", id, caseId);
  run("UPDATE section_assignments SET status = ?, resolved_at = ? WHERE id = ? AND case_id = ?", status, status === "done" ? now() : null, id, caseId);
  // Approval is recorded in the conversation so the case keeps an audit trail.
  if (a && status === "done" && a.status !== "done") {
    postMessage(caseId, "assistant", { text: `**${sectionLabel(caseId, a.section) ?? a.section}** approved as accurate by ${user.name}.` }, user.id);
  }
}

export function removeAssignment(user: User, caseId: string, id: string) {
  getCaseForUser(user, caseId);
  run("DELETE FROM section_assignments WHERE id = ? AND case_id = ?", id, caseId);
}

// Per-section settings on a case: instructions that steer analysis, whether
// citations show, and whether the section is collapsed or hidden.
export interface SectionSettings {
  instructions?: string;
  citations?: boolean;
  collapsed?: boolean;
  hidden?: boolean;
}

export function getSectionSettings(caseId: string): Record<string, SectionSettings> {
  return parseJson<Record<string, SectionSettings>>(get<{ section_settings: string }>("SELECT section_settings FROM cases WHERE id = ?", caseId)?.section_settings, {});
}

export function updateSectionSettings(user: User, caseId: string, section: string, patch: SectionSettings) {
  getCaseForUser(user, caseId);
  if (!sectionLabel(caseId, section)) throw new HttpError(400, "Unknown section");
  const all = getSectionSettings(caseId);
  all[section] = { ...all[section], ...patch };
  run("UPDATE cases SET section_settings = ? WHERE id = ?", JSON.stringify(all), caseId);
  return all;
}

/** Saved section instructions, phrased for the analysis prompt. */
export function sectionInstructionText(caseId: string): string {
  const all = getSectionSettings(caseId);
  return Object.entries(all)
    .filter(([k, v]) => isSectionKey(k) && v.instructions?.trim())
    .map(([k, v]) => `For "${PACK_SECTIONS[k as keyof typeof PACK_SECTIONS]}": ${v.instructions!.trim()}`)
    .join("\n");
}
