import { requireUser } from "@/server/auth";
import { queueEvidenceProcessing } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Process or re-process (retry) one evidence item. Never creates a new evidence record. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  return Response.json({ runId: queueEvidenceProcessing(user, evidenceId) }, { status: 202 });
});
