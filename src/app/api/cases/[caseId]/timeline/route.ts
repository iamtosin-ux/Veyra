import { z } from "zod";
import { requireUser } from "@/server/auth";
import { reorderChronology, resetChronologyOrder } from "@/server/chronologyOrder";
import { getCaseForUser } from "@/server/cases";
import { listChronology } from "@/server/findings";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  return Response.json({ events: listChronology(caseId) });
});

/** Reorder the chronology by hand ({ order, confirm }), or go back to date order ({ reset: true }). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.union([z.object({ order: z.array(z.string()).max(1000), confirm: z.boolean().optional() }), z.object({ reset: z.literal(true) })]).parse(await req.json());
  if ("reset" in b) {
    resetChronologyOrder(user, caseId);
    return Response.json({ saved: true, impact: { conflicts: [], findings: [] } });
  }
  return Response.json(reorderChronology(user, caseId, b.order, !!b.confirm));
});
