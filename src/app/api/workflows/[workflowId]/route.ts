import { z } from "zod";
import { requireUser } from "@/server/auth";
import { deleteWorkflow, saveWorkflow } from "@/server/workflows";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ workflowId: string }> };
const Body = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).default(""), steps: z.array(z.string()).min(1), instructions: z.string().max(4000).default("") });

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { workflowId } = await params;
  return Response.json({ workflow: saveWorkflow(user, { ...Body.parse(await req.json()), id: workflowId }) });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { workflowId } = await params;
  deleteWorkflow(user, workflowId);
  return Response.json({ ok: true });
});
