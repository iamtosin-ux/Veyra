import { z } from "zod";
import { requireUser } from "@/server/auth";
import { queueSegmentInspection } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };
const Body = z.object({ center: z.number().min(0), halfWindow: z.number().min(1).max(6).default(3) });

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const b = Body.parse(await req.json());
  return Response.json({ runId: queueSegmentInspection(user, evidenceId, b.center, b.halfWindow) }, { status: 202 });
});
