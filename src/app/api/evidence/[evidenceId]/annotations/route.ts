import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addAnnotation } from "@/server/annotations";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const b = z.object({ start: z.number().min(0), end: z.number().min(0).nullable().optional(), description: z.string().max(2000) }).parse(await req.json());
  return Response.json(addAnnotation(user, evidenceId, b), { status: 201 });
});
