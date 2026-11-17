import { requireUser } from "@/server/auth";
import { getEvidenceForUser } from "@/server/evidence";
import { createFileLinkToken, FILE_LINK_TTL_SECONDS } from "@/server/fileLinks";
import { audit } from "@/server/compliance/engine";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Issue a short-lived link to the original for sharing. It stops working after a few minutes. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const e = getEvidenceForUser(user, evidenceId);
  const { token, expiresAt } = createFileLinkToken(e.id, user.organisation_id);
  audit({
    organisationId: user.organisation_id,
    caseId: e.case_id,
    evidenceId: e.id,
    user,
    actor: user.name,
    operation: "file_access",
    purpose: null,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: `Created a link to the original that expires in ${FILE_LINK_TTL_SECONDS / 60} minutes.`,
    provider: null,
  });
  return Response.json({ path: `/api/evidence/${e.id}/file?t=${encodeURIComponent(token)}`, expires_at: expiresAt });
});
