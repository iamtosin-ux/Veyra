import { z } from "zod";
import { requireUser } from "@/server/auth";
import { removeAssignment, requestChanges, setAssignmentStatus } from "@/server/collab";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; assignmentId: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, assignmentId } = await params;
  const b = z.object({ status: z.enum(["open", "done", "changes"]), note: z.string().max(1000).default("") }).parse(await req.json());
  if (b.status === "changes") requestChanges(user, caseId, assignmentId, b.note);
  else setAssignmentStatus(user, caseId, assignmentId, b.status);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, assignmentId } = await params;
  removeAssignment(user, caseId, assignmentId);
  return Response.json({ ok: true });
});
