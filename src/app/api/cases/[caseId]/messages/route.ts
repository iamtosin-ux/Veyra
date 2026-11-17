import { z } from "zod";
import { requireUser } from "@/server/auth";
import { listMessages, sendMessage } from "@/server/assistant/assistant";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ messages: listMessages(user, caseId), aiConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) });
});

const Body = z.object({ text: z.string().max(8000).default(""), attachments: z.array(z.string()).max(50).default([]), web: z.boolean().default(false) });

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = Body.parse(await req.json());
  return Response.json({ messages: await sendMessage(user, caseId, b.text, b.attachments, { web: b.web }) }, { status: 201 });
});
