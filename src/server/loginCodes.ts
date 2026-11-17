import crypto from "node:crypto";
import { get, now, run } from "./db";
import { HttpError } from "./auth";

// Email sign-in codes: six digits, valid for 10 minutes, five attempts.
// No email service is connected yet, so outside production the code is
// returned to the sign-in page instead of being emailed.

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const hash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

function userByEmail(email: string) {
  return get<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL", email.trim());
}

export function requestLoginCode(email: string): { devCode: string | null } {
  const user = userByEmail(email);
  if (!user) return { devCode: null };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  run("UPDATE login_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL", now(), user.id);
  run(
    "INSERT INTO login_codes (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    user.id,
    hash(code),
    new Date(Date.now() + TTL_MS).toISOString(),
    now(),
  );
  return { devCode: process.env.NODE_ENV === "production" ? null : code };
}

export function verifyLoginCode(email: string, code: string): string {
  const user = userByEmail(email);
  const row = user
    ? get<{ id: string; code_hash: string; expires_at: string; attempts: number }>(
        "SELECT id, code_hash, expires_at, attempts FROM login_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
        user.id,
      )
    : undefined;
  if (!user || !row || row.expires_at <= now() || row.attempts >= MAX_ATTEMPTS) throw new HttpError(401, "That code has expired. Request a new one.");
  const a = Buffer.from(hash(code.trim()));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    run("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
    throw new HttpError(401, "That code isn't right");
  }
  run("UPDATE login_codes SET used_at = ? WHERE id = ?", now(), row.id);
  return user.id;
}
