import { z } from "zod";
import { requireUser } from "@/server/auth";
import { removeMember, setMemberRole, transferOwnership } from "@/server/members";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; memberId: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, memberId } = await params;
  const b = z.union([z.object({ role: z.enum(["manager", "editor", "viewer"]) }), z.object({ owner: z.literal(true) })]).parse(await req.json());
  if ("owner" in b) transferOwnership(user, caseId, memberId);
  else setMemberRole(user, caseId, memberId, b.role);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, memberId } = await params;
  removeMember(user, caseId, memberId);
  return Response.json({ ok: true });
});
