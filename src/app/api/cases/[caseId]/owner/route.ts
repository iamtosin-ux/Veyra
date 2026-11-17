import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { transferTo } from "@/server/members";

type Ctx = { params: Promise<{ caseId: string }> };

/** Make someone in the workspace the case's owner. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const { user_id } = z.object({ user_id: z.string().min(1) }).parse(await req.json());
  transferTo(user, caseId, user_id);
  return Response.json({ ok: true });
});
