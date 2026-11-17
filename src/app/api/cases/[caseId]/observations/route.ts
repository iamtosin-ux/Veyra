import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { listObservations } from "@/server/observations";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  return Response.json({ observations: listObservations({ caseId }) });
});
