import { requireUser } from "@/server/auth";
import { removePrecedent } from "@/server/precedents";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ precedentId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { precedentId } = await params;
  removePrecedent(user, precedentId);
  return Response.json({ ok: true });
});
