import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addPrecedent } from "@/server/precedents";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ findingId: string }> };
const Body = z.object({
  title: z.string().min(1).max(500),
  citation: z.string().max(100).nullable(),
  court: z.string().max(200).nullable(),
  date: z.string().max(20).nullable(),
  url: z.string().url().max(500),
  note: z.string().max(2000).nullable().optional(),
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { findingId } = await params;
  return Response.json({ id: addPrecedent(user, findingId, Body.parse(await req.json())) });
});
