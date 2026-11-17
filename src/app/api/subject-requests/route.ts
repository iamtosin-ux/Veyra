import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createRequest, listRequests } from "@/server/compliance/subjects";
import { handle } from "@/server/http";

export const GET = handle(async () => Response.json({ requests: listRequests(await requireUser()) }));

const Body = z.object({
  kind: z.enum(["access", "erasure"]),
  subject_name: z.string().trim().min(1).max(200),
  identifiers: z.array(z.string().max(200)).max(20).default([]),
  received_at: z.string().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/** Log a data-subject request; the response deadline is set from the date it was received. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  return Response.json({ request: createRequest(user, Body.parse(await req.json())) }, { status: 201 });
});
