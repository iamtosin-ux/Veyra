import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { caseIntegrity } from "@/server/analysis/integrity";
import { caseIntegrityReviews, pendingIntegrity, queueCaseIntegrity } from "@/server/integrityReview";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Latest report per item, which items are still being checked, and any reviewer decisions. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  return Response.json({ reports: Object.fromEntries(caseIntegrity(caseId)), pending: pendingIntegrity(caseId), reviews: caseIntegrityReviews(caseId) });
});

/** Re-check every item in the case. Runs in the background; poll GET for progress. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ queued: queueCaseIntegrity(user, caseId) }, { status: 202 });
});
