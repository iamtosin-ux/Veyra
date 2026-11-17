import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { previewCasePack } from "@/server/casepack";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Live draft of the case pack (unreviewed material labelled). Saves a new version when the content has changed. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  return Response.json(previewCasePack(user, caseId));
});
