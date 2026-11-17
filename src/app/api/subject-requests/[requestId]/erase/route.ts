import { z } from "zod";
import { requireUser } from "@/server/auth";
import { eraseRequest } from "@/server/compliance/subjects";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ requestId: string }> };

/** Delete the selected items and erase the person's identifiers elsewhere. Legal holds are respected. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { requestId } = await params;
  const b = z.object({ evidenceIds: z.array(z.string()).max(500).default([]), redact: z.boolean().default(true) }).parse(await req.json());
  return Response.json(eraseRequest(user, requestId, b));
});
