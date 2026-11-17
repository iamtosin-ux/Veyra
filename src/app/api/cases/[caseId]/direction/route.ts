import { z } from "zod";
import { requireUser } from "@/server/auth";
import { assessCaseAs, caseDirection, dismissHandoff, setCaseType } from "@/server/direction";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/**
 * The case's type, how well the evidence fits it, and any suggested handoff to another type.
 * With ?type=, just the case's evidence against that type's checklist (for a canvas template).
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const type = new URL(req.url).searchParams.get("type");
  if (type) return Response.json({ assessment: assessCaseAs(user, caseId, type) });
  return Response.json(caseDirection(user, caseId));
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("commit"), to: z.string() }),
  z.object({ action: z.literal("dismiss"), to: z.string() }),
  z.object({ action: z.literal("set"), to: z.string().nullable() }),
]);

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = Body.parse(await req.json());
  if (b.action === "dismiss") dismissHandoff(user, caseId, b.to);
  else setCaseType(user, caseId, b.to, { handoff: b.action === "commit" });
  return Response.json(caseDirection(user, caseId));
});
