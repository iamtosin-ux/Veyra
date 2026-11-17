import { requireUser } from "@/server/auth";
import { deleteView } from "@/server/tasks";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; viewId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, viewId } = await params;
  deleteView(user, caseId, viewId);
  return Response.json({ ok: true });
});
