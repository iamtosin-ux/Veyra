import { requireUser } from "@/server/auth";
import { caseSummary, restoreCase } from "@/server/cases";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ case: caseSummary(restoreCase(user, caseId)) });
});
