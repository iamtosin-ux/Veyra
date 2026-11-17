import crypto from "node:crypto";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";

/**
 * People on a case. The owner is whoever created it; others are invited as
 * case managers, editors or viewers. Invitations aren't emailed: a person who
 * already has an account in the workspace is linked straight away, anyone else
 * is linked when they join with that email.
 */

export type MemberRole = "manager" | "editor" | "viewer";
export const ROLES: MemberRole[] = ["manager", "editor", "viewer"];

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: MemberRole;
  joined: boolean;
  invited_at: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Owners, case managers and workspace admins decide who is on a case. */
function requireManager(user: User, caseId: string) {
  const c = getCaseForUser(user, caseId, "case");
  const manager = get("SELECT 1 FROM case_members WHERE case_id = ? AND user_id = ? AND role = 'manager'", caseId, user.id);
  if (user.role !== "admin" && c.created_by !== user.id && !manager) throw new HttpError(403, "Only the owner or a case manager can change who has access");
  return c;
}

export function caseAccess(user: User, caseId: string) {
  const c = getCaseForUser(user, caseId, "case");
  const owner = c.created_by ? get<{ id: string; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = ?", c.created_by) : undefined;
  const members = all<Omit<Member, "joined"> & { joined: number }>(
    `SELECT m.id, m.email, u.name, m.role, m.user_id IS NOT NULL joined, m.invited_at
       FROM case_members m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.case_id = ? ORDER BY m.role = 'manager' DESC, m.invited_at`,
    caseId,
  ).map((m) => ({ ...m, joined: !!m.joined }));
  return {
    access: c.access ?? "workspace",
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email.endsWith("@local.invalid") ? null : owner.email, you: owner.id === user.id } : null,
    members,
  };
}

export function inviteMember(user: User, caseId: string, email: string, role: MemberRole) {
  requireManager(user, caseId);
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new HttpError(400, `“${email}” isn't an email address`);
  if (!ROLES.includes(role)) throw new HttpError(400, "Unknown role");
  const account = get<{ id: string }>("SELECT id FROM users WHERE lower(email) = ? AND organisation_id = ? AND deleted_at IS NULL", e, user.organisation_id);
  const c = get<{ created_by: string | null }>("SELECT created_by FROM cases WHERE id = ?", caseId);
  if (account && account.id === c?.created_by) throw new HttpError(409, "They already own this case");
  if (get("SELECT 1 FROM case_members WHERE case_id = ? AND email = ?", caseId, e)) throw new HttpError(409, `${e} is already on this case`);
  run(
    "INSERT INTO case_members (id, case_id, user_id, email, role, invited_by, invited_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(), caseId, account?.id ?? null, e, role, user.id, now(),
  );
  touchCase(caseId);
  return { joined: !!account };
}

export function setMemberRole(user: User, caseId: string, memberId: string, role: MemberRole) {
  requireManager(user, caseId);
  if (!ROLES.includes(role)) throw new HttpError(400, "Unknown role");
  run("UPDATE case_members SET role = ? WHERE id = ? AND case_id = ?", role, memberId, caseId);
  touchCase(caseId);
}

export function removeMember(user: User, caseId: string, memberId: string) {
  requireManager(user, caseId);
  run("DELETE FROM case_members WHERE id = ? AND case_id = ?", memberId, caseId);
  touchCase(caseId);
}

export function setCaseAccess(user: User, caseId: string, access: "workspace" | "invited") {
  requireManager(user, caseId);
  if (access !== "workspace" && access !== "invited") throw new HttpError(400, "Unknown access setting");
  run("UPDATE cases SET access = ? WHERE id = ?", access, caseId);
  touchCase(caseId);
}

/**
 * Hand the case to another case manager. The new owner leaves the member list
 * (owners aren't members); the previous owner stays on as a case manager.
 */
export function transferOwnership(user: User, caseId: string, memberId: string) {
  const c = requireManager(user, caseId);
  const m = get<{ user_id: string | null; role: MemberRole; email: string }>("SELECT user_id, role, email FROM case_members WHERE id = ? AND case_id = ?", memberId, caseId);
  if (!m) throw new HttpError(404, "Member not found");
  if (m.role !== "manager") throw new HttpError(400, "Ownership can only go to a case manager");
  if (!m.user_id) throw new HttpError(400, `${m.email} hasn't joined yet, so they can't own the case`);
  const previous = c.created_by ? get<{ email: string }>("SELECT email FROM users WHERE id = ?", c.created_by) : undefined;
  run("UPDATE cases SET created_by = ?, transferred_by = ?, transferred_at = ? WHERE id = ?", m.user_id, user.id, now(), caseId);
  run("DELETE FROM case_members WHERE id = ?", memberId);
  if (c.created_by && previous && !get("SELECT 1 FROM case_members WHERE case_id = ? AND user_id = ?", caseId, c.created_by)) {
    run(
      "INSERT INTO case_members (id, case_id, user_id, email, role, invited_by, invited_at) VALUES (?, ?, ?, ?, 'manager', ?, ?)",
      crypto.randomUUID(), caseId, c.created_by, previous.email.toLowerCase(), user.id, now(),
    );
  }
  touchCase(caseId);
}

/**
 * Hand the case to anyone in the workspace. Someone not yet on the case joins
 * as a case manager first; then ownership moves as above.
 */
export function transferTo(user: User, caseId: string, userId: string) {
  const c = requireManager(user, caseId);
  if (c.created_by === userId) throw new HttpError(409, "They already own this case");
  const person = get<{ id: string; email: string }>("SELECT id, email FROM users WHERE id = ? AND organisation_id = ? AND deleted_at IS NULL", userId, user.organisation_id);
  if (!person) throw new HttpError(404, "Person not found");
  const existing = get<{ id: string; role: MemberRole }>("SELECT id, role FROM case_members WHERE case_id = ? AND user_id = ?", caseId, userId);
  let memberId = existing?.id;
  if (!memberId) {
    memberId = crypto.randomUUID();
    run(
      "INSERT INTO case_members (id, case_id, user_id, email, role, invited_by, invited_at) VALUES (?, ?, ?, ?, 'manager', ?, ?)",
      memberId, caseId, userId, person.email.toLowerCase(), user.id, now(),
    );
  } else if (existing && existing.role !== "manager") {
    run("UPDATE case_members SET role = 'manager' WHERE id = ?", memberId);
  }
  transferOwnership(user, caseId, memberId);
}
