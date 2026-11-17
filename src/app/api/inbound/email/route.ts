import crypto from "node:crypto";
import { HttpError } from "@/server/auth";
import { fromPostmark, ingestEmail } from "@/server/inboundEmail";
import { handle } from "@/server/http";

/** The shared secret, from HTTP basic auth (any username) or ?token=. */
function secretFrom(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) return Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").slice(1).join(":");
  return new URL(req.url).searchParams.get("token") ?? "";
}

const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Inbound email from the provider (Postmark's inbound webhook format). Mail to
 * an upload request's address becomes evidence in its case or folder. Off until
 * VEYRA_INBOUND_SECRET is set; the provider must send that secret with each call.
 */
export const POST = handle(async (req: Request) => {
  const secret = process.env.VEYRA_INBOUND_SECRET;
  if (!secret) throw new HttpError(503, "Inbound email isn't configured");
  if (!same(secretFrom(req), secret)) throw new HttpError(401, "Not authorised");
  try {
    return Response.json({ ok: true, ...ingestEmail(fromPostmark(await req.json())) });
  } catch (e) {
    // Mail to a closed or unknown inbox is acknowledged, so the provider doesn't keep retrying it.
    if (e instanceof HttpError && e.status === 404) return Response.json({ ok: false, ignored: e.message });
    throw e;
  }
});
