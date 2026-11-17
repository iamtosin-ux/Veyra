import { requireUser } from "@/server/auth";
import { removeObservation } from "@/server/annotations";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ observationId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { observationId } = await params;
  removeObservation(user, observationId);
  return Response.json({ ok: true });
});
