import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { listFindings } from "@/server/findings";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  const includeSuperseded = new URL(req.url).searchParams.get("superseded") === "1";
  return Response.json({ findings: listFindings(caseId, { includeSuperseded }) });
});
