import { z } from "zod";
import { requireUser } from "@/server/auth";
import { caseAccess, inviteMember, setCaseAccess } from "@/server/members";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json(caseAccess(user, caseId));
});

/** Invite someone, or change who can open the case. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.union([
    z.object({ email: z.string().max(200), role: z.enum(["manager", "editor", "viewer"]) }),
    z.object({ access: z.enum(["workspace", "invited"]) }),
  ]).parse(await req.json());
  if ("access" in b) {
    setCaseAccess(user, caseId, b.access);
    return Response.json({ ok: true });
  }
  return Response.json(inviteMember(user, caseId, b.email, b.role));
});
