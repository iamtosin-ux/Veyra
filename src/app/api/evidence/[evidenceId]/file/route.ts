import { currentUser, HttpError } from "@/server/auth";
import { getEvidence, getEvidenceForUser } from "@/server/evidence";
import { originalSize, readOriginalRange } from "@/server/storage";
import { verifyFileLinkToken } from "@/server/fileLinks";
import { audit, caseOrganisation } from "@/server/compliance/engine";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/**
 * Streams the untouched original, decrypted on the fly. Authorised by the
 * signed-in user's organisation, or by a short-lived signed link for this file.
 * Supports HTTP Range so video/audio can seek to cited timestamps.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { evidenceId } = await params;
  const url = new URL(req.url);
  const user = await currentUser();
  let e;
  let via: "session" | "link";
  if (user) {
    e = getEvidenceForUser(user, evidenceId);
    via = "session";
  } else {
    const org = verifyFileLinkToken(url.searchParams.get("t"), evidenceId);
    const found = org ? getEvidence(evidenceId) : undefined;
    if (!org || !found || caseOrganisation(found.case_id) !== org) throw new HttpError(401, "This link is invalid or has expired");
    e = found;
    via = "link";
  }
  const size = originalSize(e.storage_reference);
  // Only formats the browser shows safely are served inline; office files are previewed through /preview.
  const download = url.searchParams.get("download") === "1" || !/^(application\/pdf|image\/|video\/|audio\/|text\/plain)/.test(e.mime_type);
  const mime = e.mime_type === "text/plain" ? "text/plain; charset=utf-8" : e.mime_type;
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(e.original_filename)}"`,
  };
  if (e.mime_type !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (m) {
    start = m[1] ? Number(m[1]) : NaN;
    end = m[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start)) {
      start = Math.max(0, size - end);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  // One audit entry per opening, not per seek: media players fetch many ranges.
  if (start === 0) {
    audit({
      organisationId: caseOrganisation(e.case_id),
      caseId: e.case_id,
      evidenceId: e.id,
      user: user ? { id: user.id } : null,
      actor: user ? user.name : "Signed link",
      operation: "file_access",
      purpose: null,
      policyId: null,
      policyVersion: null,
      decision: "RECORDED",
      reasons: [],
      explanation: `${download ? "Downloaded" : "Opened"} the original ${via === "link" ? "through a signed link" : "in Veyra"}.`,
      provider: null,
    });
  }
  const body = new Uint8Array(size === 0 ? Buffer.alloc(0) : readOriginalRange(e.storage_reference, start, end));
  if (m) return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
});
