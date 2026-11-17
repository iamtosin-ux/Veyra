import { requireUser } from "@/server/auth";
import { forkCase } from "@/server/fork";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json(forkCase(user, caseId), { status: 201 });
});
