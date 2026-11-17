import crypto from "node:crypto";
import { cookies } from "next/headers";
import { get, now, run, tx } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export interface User {
  id: string;
  organisation_id: string;
  name: string;
  email: string;
  role: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function hasAnyUser(): boolean {
  return !!get("SELECT id FROM users LIMIT 1");
}

/** First-run setup only: creates the organisation and its administrator. */
export function createInitialAdmin(input: { organisation: string; name: string; username: string; password: string; email?: string }): User {
  return tx(() => {
    if (hasAnyUser()) throw new HttpError(409, "Setup has already been completed");
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const ts = now();
    run("INSERT INTO organisations (id, name, created_at) VALUES (?, ?, ?)", orgId, input.organisation, ts);
    const username = input.username.trim().toLowerCase();
    const email = (input.email ?? `${username}@local.invalid`).toLowerCase();
    run(
      "INSERT INTO users (id, organisation_id, name, email, username, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)",
      userId,
      orgId,
      input.name,
      email,
      username,
      hashPassword(input.password),
      ts,
    );
    return { id: userId, organisation_id: orgId, name: input.name, email, role: "admin" };
  });
}

/** Sign in with a username (or, for older accounts, an email address). */
export function authenticate(identifier: string, password: string): User | null {
  const id = identifier.trim().toLowerCase();
  const row = get<User & { password_hash: string }>("SELECT * FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL LIMIT 1", id, id);
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, organisation_id: row.organisation_id, name: row.name, email: row.email, role: row.role };
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return get<User>("SELECT id, organisation_id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL", userId) ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Not signed in");
  return user;
}

/** Set (or change) the username and password of the organisation's first admin. Used by scripts/set-login.mts. */
export function setAdminLogin(username: string, password: string) {
  const admin = get<{ id: string }>("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (!admin) throw new Error("No admin account exists yet; complete /setup first.");
  run("UPDATE users SET username = ?, password_hash = ? WHERE id = ?", username.trim().toLowerCase(), hashPassword(password), admin.id);
  return admin.id;
}

export function getProfile(user: User) {
  const row = get<{ name: string; email: string; username: string | null; role: string; created_at: string; ai_training: number; ai_training_changed_at: string | null; email_notifications: number }>(
    "SELECT name, email, username, role, created_at, ai_training, ai_training_changed_at, email_notifications FROM users WHERE id = ?",
    user.id,
  )!;
  const org = get<{ name: string }>("SELECT name FROM organisations WHERE id = ?", user.organisation_id);
  return { ...row, ai_training: !!row.ai_training, email_notifications: !!row.email_notifications, email: row.email.endsWith("@local.invalid") ? null : row.email, organisation: org?.name ?? "" };
}

export function updateProfile(user: User, input: { name?: string; email?: string | null; organisation?: string; ai_training?: boolean; email_notifications?: boolean }) {
  if (input.email_notifications !== undefined) run("UPDATE users SET email_notifications = ? WHERE id = ?", input.email_notifications ? 1 : 0, user.id);
  // Opt-in only, and the time of each change is kept.
  if (input.ai_training !== undefined) run("UPDATE users SET ai_training = ?, ai_training_changed_at = ? WHERE id = ?", input.ai_training ? 1 : 0, now(), user.id);
  if (input.name !== undefined) run("UPDATE users SET name = ? WHERE id = ?", input.name.trim(), user.id);
  if (input.email !== undefined) {
    const email = (input.email ?? "").trim().toLowerCase();
    run("UPDATE users SET email = ? WHERE id = ?", email || `${user.id}@local.invalid`, user.id);
  }
  if (input.organisation !== undefined && user.role === "admin") run("UPDATE organisations SET name = ? WHERE id = ?", input.organisation.trim(), user.organisation_id);
  return getProfile(user);
}

export function changePassword(user: User, current: string, next: string) {
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id)!;
  if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, "Current password is incorrect");
  if (next.length < 5) throw new HttpError(400, "New password must be at least 5 characters");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), user.id);
}

/** AI and processing usage for the organisation, from recorded per-call usage. */
export function usageSummary(user: User) {
  const totals = get<{ calls: number; input: number; output: number; images: number; media: number }>(
    `SELECT COUNT(*) calls, COALESCE(SUM(u.input_tokens),0) input, COALESCE(SUM(u.output_tokens),0) output, COALESCE(SUM(u.images_sent),0) images, COALESCE(SUM(u.media_seconds),0) media
       FROM ai_usage u JOIN analysis_runs r ON r.id = u.analysis_run_id JOIN cases c ON c.id = r.case_id WHERE c.organisation_id = ?`,
    user.organisation_id,
  )!;
  const counts = get<{ cases: number; evidence: number; runs: number; workflows: number }>(
    `SELECT (SELECT COUNT(*) FROM cases WHERE organisation_id = ? AND kind = 'case' AND deleted_at IS NULL) cases,
            (SELECT COUNT(*) FROM evidence e JOIN cases c ON c.id = e.case_id WHERE c.organisation_id = ?) evidence,
            (SELECT COUNT(*) FROM analysis_runs r JOIN cases c ON c.id = r.case_id WHERE c.organisation_id = ?) runs,
            (SELECT COUNT(*) FROM workflow_runs w JOIN cases c ON c.id = w.case_id WHERE c.organisation_id = ?) workflows`,
    user.organisation_id,
    user.organisation_id,
    user.organisation_id,
    user.organisation_id,
  )!;
  // Progress through the first steps, for Get started.
  const steps = get<{ reviewed: number; packs: number; shared: number }>(
    `SELECT (SELECT COUNT(*) FROM findings f JOIN cases c ON c.id = f.case_id WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND f.review_status != 'unreviewed') reviewed,
            (SELECT COUNT(*) FROM case_packs p JOIN cases c ON c.id = p.case_id WHERE c.organisation_id = ? AND c.deleted_at IS NULL) packs,
            (SELECT COUNT(*) FROM upload_invites i JOIN cases c ON c.id = i.case_id WHERE c.organisation_id = ?) shared`,
    user.organisation_id,
    user.organisation_id,
    user.organisation_id,
  )!;
  return { ai: totals, ...counts, ...steps, ai_configured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) };
}
