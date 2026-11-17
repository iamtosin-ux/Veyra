import { z } from "zod";
import { requireUser } from "@/server/auth";
import { caseSummary, createCase, listCases } from "@/server/cases";
import { handle } from "@/server/http";

const Body = z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(5000).default("") });

export const GET = handle(async () => Response.json({ cases: listCases(await requireUser()) }));

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { title, description } = Body.parse(await req.json());
  return Response.json({ case: caseSummary(createCase(user, title, description)) }, { status: 201 });
});
