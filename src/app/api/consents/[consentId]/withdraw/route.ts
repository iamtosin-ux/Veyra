import { z } from "zod";
import { requireUser } from "@/server/auth";
import { withdrawConsent } from "@/server/compliance/consent";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ consentId: string }> };

/** Record a withdrawal. Processing of the covered items stops and dependent findings are flagged. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { consentId } = await params;
  const { reason } = z.object({ reason: z.string().max(1000).default("") }).parse(await req.json());
  return Response.json(withdrawConsent(user, consentId, reason));
});
