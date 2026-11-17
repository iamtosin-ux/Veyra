import { z } from "zod";
import { requireUser } from "@/server/auth";
import { startWorkflowRun } from "@/server/workflows";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ workflowId: string }> };

/** Deploy a workflow on a case with the user's prompt. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { workflowId } = await params;
  const { caseId, prompt } = z.object({ caseId: z.string(), prompt: z.string().max(8000).default("") }).parse(await req.json());
  return Response.json({ runId: startWorkflowRun(user, workflowId, caseId, prompt) }, { status: 202 });
});
