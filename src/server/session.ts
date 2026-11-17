import crypto from "node:crypto";

// Stateless signed session token: "<userId>.<expiresMs>.<hmac>".
// Kept free of DB imports so proxy.ts can use it.

export const SESSION_COOKIE = "ei_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example)");
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): { token: string; maxAgeSeconds: number } {
  const payload = `${userId}.${Date.now() + MAX_AGE_MS}`;
  return { token: `${payload}.${sign(payload)}`, maxAgeSeconds: MAX_AGE_MS / 1000 };
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!(Number(expires) > Date.now())) return null;
  return userId;
}
