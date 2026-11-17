import { z } from "zod";
import { requireUser } from "@/server/auth";
import { assignSection, listAssignments } from "@/server/collab";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ assignments: listAssignments(user, caseId) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ section: z.string(), assignee: z.string().trim().min(1).max(120), kind: z.enum(["person", "team"]), note: z.string().max(1000).default("") }).parse(await req.json());
  return Response.json({ id: assignSection(user, caseId, b) }, { status: 201 });
});
