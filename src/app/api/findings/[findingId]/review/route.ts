import { z } from "zod";
import { requireUser } from "@/server/auth";
import { reviewFinding } from "@/server/findings";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ findingId: string }> };
const Body = z.object({
  action: z.enum(["accept", "correct", "reject", "reset", "archive", "unarchive"]),
  title: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  note: z.string().max(5000).nullable().optional(),
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { findingId } = await params;
  const b = Body.parse(await req.json());
  return Response.json({ finding: reviewFinding(user, findingId, b.action, b) });
});
