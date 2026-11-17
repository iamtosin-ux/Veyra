import { z } from "zod";
import { requireUser } from "@/server/auth";
import { RELATIONSHIPS, caseOwner, createInvite, listInvites } from "@/server/invites";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ invites: listInvites(user, caseId), owner: caseOwner(user, caseId), roles: RELATIONSHIPS });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ label: z.string().max(120).default(""), message: z.string().max(2000).default(""), days: z.number().int().min(1).max(90).default(14), relationship: z.string().trim().max(60).nullable().default(null), contact: z.string().max(200).nullable().default(null) }).parse(await req.json());
  return Response.json({ invite: createInvite(user, caseId, b) }, { status: 201 });
});
