import { requireUser } from "@/server/auth";
import { queueIntegrityCheck } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Scan one item again. Runs in the background; the case's integrity endpoint shows progress. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  queueIntegrityCheck(user, evidenceId);
  return Response.json({ queued: true }, { status: 202 });
});
