import { z } from "zod";
import { requireUser } from "@/server/auth";
import { reviewChronologyEvent } from "@/server/findings";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ eventId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { eventId } = await params;
  const { status } = z.object({ status: z.enum(["accepted", "rejected", "unreviewed"]) }).parse(await req.json());
  reviewChronologyEvent(user, eventId, status);
  return Response.json({ ok: true });
});
