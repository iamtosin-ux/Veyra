import { z } from "zod";
import { requireUser } from "@/server/auth";
import { revokeInvite, setInviteRole } from "@/server/invites";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; inviteId: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, inviteId } = await params;
  const b = z.object({ relationship: z.string().trim().max(60).nullable() }).parse(await req.json());
  setInviteRole(user, caseId, inviteId, b.relationship);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, inviteId } = await params;
  revokeInvite(user, caseId, inviteId);
  return Response.json({ ok: true });
});
