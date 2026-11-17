import { requireUser } from "@/server/auth";
import { queueCaseAnalysis } from "@/server/analysis/caseAnalysis";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const body = await req.json().catch(() => ({}));
  const focus = typeof body?.focus === "string" ? body.focus.slice(0, 2000) : undefined;
  return Response.json({ runId: queueCaseAnalysis(user, caseId, focus) }, { status: 202 });
});
