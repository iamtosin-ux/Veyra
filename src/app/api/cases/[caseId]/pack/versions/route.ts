import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { all } from "@/server/db";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Every saved version of the case pack, newest first. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  const versions = all<{ id: string; version: number; generated_at: string; approved_at: string | null; approved_by: string | null }>(
    `SELECT p.id, p.version, p.generated_at, p.approved_at, u.name approved_by
       FROM case_packs p LEFT JOIN users u ON u.id = p.approved_by
      WHERE p.case_id = ? ORDER BY p.version DESC LIMIT 100`,
    caseId,
  );
  return Response.json({ versions });
});
