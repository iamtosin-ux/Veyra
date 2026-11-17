import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addActivity } from "@/server/activities";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ kind: z.string().max(60), title: z.string().max(300).nullable().optional(), details: z.string().max(4000).nullable().optional(), occurred_at: z.string().max(20).nullable().optional() }).parse(await req.json());
  return Response.json({ id: addActivity(user, caseId, b) }, { status: 201 });
});
