import crypto from "node:crypto";
import { all, get, now, parseJson, run } from "./db";
import { HttpError, getProfile, hashPassword, type User } from "./auth";

// A person's own account data: what they can download, and closing the account.

/** Everything recorded about or by this person, as JSON. Evidence files themselves stay in the workspace. */
export function exportAccountData(user: User) {
  const org = get<{ name: string }>("SELECT name FROM organisations WHERE id = ?", user.organisation_id);
  return {
    exported_at: now(),
    profile: getProfile(user),
    workspace: org?.name ?? null,
    cases_created: all("SELECT reference, title, created_at FROM cases WHERE created_by = ? AND kind = 'case' AND deleted_at IS NULL ORDER BY created_at", user.id),
    messages: all<{ case_reference: string; created_at: string; content: string }>(
      "SELECT c.reference case_reference, m.created_at, m.content FROM case_messages m JOIN cases c ON c.id = m.case_id WHERE m.author_id = ? AND m.role = 'user' ORDER BY m.created_at",
      user.id,
    ).map((m) => ({ case_reference: m.case_reference, created_at: m.created_at, text: parseJson<{ text?: string }>(m.content, {}).text ?? "" })),
    files_uploaded: all(
      "SELECT c.reference case_reference, e.reference, e.original_filename, e.file_size, e.uploaded_at FROM evidence e JOIN cases c ON c.id = e.case_id WHERE e.uploaded_by = ? ORDER BY e.uploaded_at",
      user.id,
    ),
    finding_reviews: all(
      "SELECT f.reference finding_reference, c.reference case_reference, r.action, r.review_note, r.reviewed_at FROM finding_reviews r JOIN findings f ON f.id = r.finding_id JOIN cases c ON c.id = f.case_id WHERE r.reviewer_id = ? ORDER BY r.reviewed_at",
      user.id,
    ),
  };
}

/**
 * Close this person's account: they are signed out everywhere and can't sign in again.
 * Their work stays in the workspace, attributed to "Deleted user". The last admin can't
 * do this, or the workspace would have nobody to run it.
 */
export function deleteAccount(user: User) {
  if (user.role === "admin") {
    const others = get<{ n: number }>("SELECT COUNT(*) n FROM users WHERE organisation_id = ? AND role = 'admin' AND id <> ? AND deleted_at IS NULL", user.organisation_id, user.id);
    if (!others?.n) throw new HttpError(409, "You're the only admin of this workspace. Make someone else an admin before deleting your account.");
  }
  run(
    "UPDATE users SET name = 'Deleted user', email = ?, username = NULL, password_hash = ?, ai_training = 0, email_notifications = 0, deleted_at = ? WHERE id = ?",
    `deleted-${user.id}@local.invalid`,
    hashPassword(crypto.randomBytes(32).toString("hex")),
    now(),
    user.id,
  );
}
