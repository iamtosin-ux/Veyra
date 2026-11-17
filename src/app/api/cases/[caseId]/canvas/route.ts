import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addSection, listSections } from "@/server/canvas";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ sections: listSections(user, caseId) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ kind: z.enum(["chronology", "evidence", "map"]), place: z.string().max(120).optional(), topic: z.string().max(120).optional() }).parse(await req.json());
  return Response.json(await addSection(user, caseId, b));
});
