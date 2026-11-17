import { z } from "zod";
import { requireUser } from "@/server/auth";
import { generateCasePack, getCasePack } from "@/server/casepack";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  return Response.json({ pack: getCasePack(user, caseId, id) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const { includeUnreviewed } = z.object({ includeUnreviewed: z.boolean() }).parse(await req.json());
  return Response.json({ pack: generateCasePack(user, caseId, includeUnreviewed) }, { status: 201 });
});
