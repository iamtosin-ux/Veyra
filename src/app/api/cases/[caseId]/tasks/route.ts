import { requireUser } from "@/server/auth";
import { TASK_KINDS, caseTasks, listViews } from "@/server/tasks";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ tasks: caseTasks(user, caseId), views: listViews(user, caseId), kinds: TASK_KINDS });
});
