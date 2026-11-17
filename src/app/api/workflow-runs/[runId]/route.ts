import { requireUser } from "@/server/auth";
import { getWorkflowRun } from "@/server/workflows";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ runId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { runId } = await params;
  const r = getWorkflowRun(user, runId);
  // Keep the payload small for the progress card.
  return Response.json({ run: { id: r.id, workflow_name: r.workflow_name, status: r.status, steps: r.steps, created_at: r.created_at, finished_at: r.finished_at } });
});
