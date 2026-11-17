import { z } from "zod";
import { requireUser } from "@/server/auth";
import { deleteDue, retentionReview, setLegalHold } from "@/server/compliance/retention";
import { handle } from "@/server/http";

/** Items past the policy's retention period, and cases on legal hold. */
export const GET = handle(async () => Response.json(retentionReview(await requireUser())));

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), evidenceIds: z.array(z.string()).min(1).max(500) }),
  z.object({ action: z.literal("hold"), caseId: z.string(), hold: z.boolean(), reason: z.string().max(1000).default("") }),
]);

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = Body.parse(await req.json());
  if (b.action === "delete") return Response.json({ deleted: deleteDue(user, b.evidenceIds) });
  setLegalHold(user, b.caseId, b.hold, b.reason);
  return Response.json({ ok: true });
});
