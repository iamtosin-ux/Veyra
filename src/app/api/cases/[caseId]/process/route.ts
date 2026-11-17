import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { all } from "@/server/db";
import { queueEvidenceProcessing } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Queue every evidence item that has not been processed yet (or failed). */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  const pending = all<{ id: string }>("SELECT id FROM evidence WHERE case_id = ? AND processing_status IN ('pending','failed')", caseId);
  const runIds = pending.map((e) => queueEvidenceProcessing(user, e.id));
  return Response.json({ queued: runIds.length });
});
