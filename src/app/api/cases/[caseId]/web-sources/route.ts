import { z } from "zod";
import { requireUser } from "@/server/auth";
import { listWebSources, proposeLink } from "@/server/websources";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ sources: listWebSources(user, caseId) });
});

/** Propose a link for a section. It is fetched now and shown in the chat for approval. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z.object({ section: z.string(), url: z.string().min(4).max(2000), note: z.string().max(1000).default("") }).parse(await req.json());
  return Response.json({ ids: await proposeLink(user, caseId, b.section, b.url, b.note) }, { status: 201 });
});
