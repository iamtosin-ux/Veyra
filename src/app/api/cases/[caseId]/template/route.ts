import { z } from "zod";
import { requireUser } from "@/server/auth";
import { switchTemplate } from "@/server/templateSwitch";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

const Body = z.object({ template: z.string().max(64), ms: z.number().int().min(0).max(600_000).default(0) });

/** Change the canvas template; Veyra reports the new layout in the conversation. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = Body.parse(await req.json());
  return Response.json({ template: switchTemplate(user, caseId, b.template, b.ms).key });
});
