import { z } from "zod";
import { requireUser } from "@/server/auth";
import { searchWebForSection } from "@/server/websources";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ section: z.string(), query: z.string().max(1000).default("") }).parse(await req.json());
  return Response.json({ ids: await searchWebForSection(user, caseId, b.section, b.query) }, { status: 201 });
});
