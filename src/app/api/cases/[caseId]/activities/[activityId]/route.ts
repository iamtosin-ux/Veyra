import { requireUser } from "@/server/auth";
import { removeActivity } from "@/server/activities";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; activityId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, activityId } = await params;
  removeActivity(user, caseId, activityId);
  return Response.json({ ok: true });
});
