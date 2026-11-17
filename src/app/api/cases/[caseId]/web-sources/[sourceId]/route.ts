import { z } from "zod";
import { requireUser } from "@/server/auth";
import { decideWebSource } from "@/server/websources";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; sourceId: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, sourceId } = await params;
  const { decision } = z.object({ decision: z.enum(["approve", "dismiss"]) }).parse(await req.json());
  decideWebSource(user, caseId, sourceId, decision);
  return Response.json({ ok: true });
});
