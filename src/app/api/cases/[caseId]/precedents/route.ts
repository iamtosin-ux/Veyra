import { requireUser } from "@/server/auth";
import { COURTS, searchCaseLaw } from "@/server/precedents";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Search Find Case Law for judgments to cite in this case. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  if (!q) return Response.json({ courts: COURTS, results: [], total: 0, page: 1 });
  return Response.json({ courts: COURTS, ...(await searchCaseLaw(user, caseId, q, u.searchParams.get("court") ?? "", Number(u.searchParams.get("page") ?? 1))) });
});
