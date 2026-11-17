import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addWrittenAccount } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };
const Body = z.object({ title: z.string().trim().min(1).max(200), author: z.string().max(200).default(""), text: z.string().trim().min(1).max(500_000) });

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = Body.parse(await req.json());
  const result = addWrittenAccount(user, caseId, b.title, b.author, b.text);
  return Response.json({ result }, { status: result.ok ? 201 : 400 });
});
