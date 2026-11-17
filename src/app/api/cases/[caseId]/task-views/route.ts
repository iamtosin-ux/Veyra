import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createView } from "@/server/tasks";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ name: z.string().max(60), kinds: z.array(z.string()) }).parse(await req.json());
  return Response.json({ id: createView(user, caseId, b.name, b.kinds) }, { status: 201 });
});
