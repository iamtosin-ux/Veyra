import { z } from "zod";
import { requireUser } from "@/server/auth";
import { keepEvidence, requestReplacement } from "@/server/integrityReview";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("request"), message: z.string().trim().min(1).max(4000) }),
]);

/** Keep a flagged file, or ask its contributor for a replacement. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const b = Body.parse(await req.json());
  if (b.action === "keep") {
    keepEvidence(user, evidenceId);
    return Response.json({ ok: true });
  }
  return Response.json(requestReplacement(user, evidenceId, b.message));
});
