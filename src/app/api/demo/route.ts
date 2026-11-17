import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createDemoCase, listDemoScenarios } from "@/server/demo/demo";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  await requireUser();
  return Response.json({ scenarios: listDemoScenarios() });
});

/** Create a clearly labelled demo case (hand-written analysis, real extraction). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = z.object({ scenario: z.string().default("social-housing") }).parse(await req.json().catch(() => ({})));
  return Response.json(createDemoCase(user, body.scenario), { status: 201 });
});
