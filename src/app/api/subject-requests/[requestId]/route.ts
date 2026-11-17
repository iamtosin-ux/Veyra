import { z } from "zod";
import { requireUser } from "@/server/auth";
import { closeRequest, getRequest, searchSubject } from "@/server/compliance/subjects";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ requestId: string }> };

/** The request and everything found for its identifiers. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { requestId } = await params;
  const request = getRequest(user, requestId);
  return Response.json({ request, ...searchSubject(user, request.identifiers) });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { requestId } = await params;
  const b = z.object({ status: z.enum(["completed", "refused"]), outcome: z.string().max(2000).default("") }).parse(await req.json());
  return Response.json({ request: closeRequest(user, requestId, b.status, b.outcome) });
});
