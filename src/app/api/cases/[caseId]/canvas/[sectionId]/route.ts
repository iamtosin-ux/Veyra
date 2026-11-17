import { requireUser } from "@/server/auth";
import { removeSection } from "@/server/canvas";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; sectionId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, sectionId } = await params;
  removeSection(user, caseId, sectionId);
  return Response.json({ ok: true });
});
