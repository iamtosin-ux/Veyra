import { z } from "zod";
import { requireUser } from "@/server/auth";
import { listConsents, recordConsent } from "@/server/compliance/consent";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ consents: listConsents(user, caseId) });
});

const Body = z.object({
  subject_name: z.string().trim().min(1).max(200),
  subject_contact: z.string().max(200).nullable().default(null),
  purpose: z.string().trim().min(1).max(1000),
  method: z.enum(["written", "electronic", "verbal"]),
  evidence_ids: z.array(z.string()).max(500).default([]),
  given_at: z.string().nullable().default(null),
});

/** Record consent given by a person, for a purpose, covering the whole case or listed items. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ consent: recordConsent(user, caseId, Body.parse(await req.json())) }, { status: 201 });
});
