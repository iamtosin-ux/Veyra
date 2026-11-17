import path from "node:path";
import { requireUser } from "@/server/auth";
import { getEvidenceForUser } from "@/server/evidence";
import { readOriginal } from "@/server/storage";
import { parseDocument, toPreviewHtml } from "@/server/extract/office";
import { audit, caseOrganisation } from "@/server/compliance/engine";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/**
 * A read-only rendering of a document the browser cannot show itself (Word,
 * spreadsheets, presentations, OpenDocument, RTF, CSV). Served as a standalone
 * page that the client puts in a sandboxed frame: no scripts, nothing fetched.
 */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const e = getEvidenceForUser(user, evidenceId);
  const ext = path.extname(e.original_filename).toLowerCase();
  const html = toPreviewHtml(await parseDocument(ext, readOriginal(e.storage_reference)));
  audit({
    organisationId: caseOrganisation(e.case_id),
    caseId: e.case_id,
    evidenceId: e.id,
    user: { id: user.id },
    actor: user.name,
    operation: "file_access",
    purpose: null,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: "Opened a preview of the original in Veyra.",
    provider: null,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
});
