import { z } from "zod";
import { requireUser } from "@/server/auth";
import { deleteProject, getProject, updateProject } from "@/server/projects";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { projectId } = await params;
  return Response.json({ project: getProject(user, projectId) });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { projectId } = await params;
  const b = z.object({ name: z.string().trim().min(1).max(200).optional(), description: z.string().max(2000).optional(), visibility: z.enum(["private", "public"]).optional() }).parse(await req.json());
  return Response.json({ project: updateProject(user, projectId, b) });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { projectId } = await params;
  deleteProject(user, projectId);
  return Response.json({ ok: true });
});
