import { z } from "zod";
import { requireUser } from "@/server/auth";
import { STEPS, listWorkflows, saveWorkflow } from "@/server/workflows";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ workflows: listWorkflows(user), steps: STEPS });
});

const Body = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).default(""), steps: z.array(z.string()).min(1), instructions: z.string().max(4000).default("") });

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  return Response.json({ workflow: saveWorkflow(user, Body.parse(await req.json())) }, { status: 201 });
});
