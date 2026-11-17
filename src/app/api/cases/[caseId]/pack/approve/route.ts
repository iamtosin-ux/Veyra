import { requireUser } from "@/server/auth";
import { approvalStatus, approveCasePack } from "@/server/approval";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ status: approvalStatus(user, caseId) });
});

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ approval: approveCasePack(user, caseId) }, { status: 201 });
});
