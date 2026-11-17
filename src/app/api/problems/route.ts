import crypto from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { now, run } from "@/server/db";
import { handle } from "@/server/http";

const Body = z.object({ message: z.string().trim().min(1).max(5000), page: z.string().max(500).nullable().optional() });

/** A problem reported from inside the app, kept for the team that runs Veyra. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = Body.parse(await req.json());
  run("INSERT INTO problem_reports (id, organisation_id, user_id, message, page, created_at) VALUES (?, ?, ?, ?, ?, ?)", crypto.randomUUID(), user.organisation_id, user.id, b.message, b.page ?? null, now());
  return Response.json({ ok: true });
});
