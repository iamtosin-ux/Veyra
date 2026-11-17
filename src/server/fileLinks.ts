import crypto from "node:crypto";

// Short-lived signed links to one evidence file: "<evidenceId>.<orgId>.<expiresMs>.<hmac>".
// No DB imports, so the proxy can check them before the route runs.

export const FILE_LINK_TTL_SECONDS = 5 * 60;

function key(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  // A separate purpose string, so a file link can never be used as a session token.
  return crypto.createHmac("sha256", s).update("veyra-file-links").digest("base64");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", key()).update(payload).digest("base64url");
}

export function createFileLinkToken(evidenceId: string, organisationId: string, ttlSeconds = FILE_LINK_TTL_SECONDS): { token: string; expiresAt: string } {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = `${evidenceId}.${organisationId}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

/** The organisation the link was issued for, or null when it's invalid, expired or for another file. */
export function verifyFileLinkToken(token: string | null | undefined, evidenceId: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, org, exp, sig] = parts;
  if (id !== evidenceId || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expected = sign(`${id}.${org}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? org : null;
}
