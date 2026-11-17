import { z } from "zod";
import { changePassword, requireUser } from "@/server/auth";
import { handle } from "@/server/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { current, next } = z.object({ current: z.string(), next: z.string() }).parse(await req.json());
  changePassword(user, current, next);
  return Response.json({ ok: true });
});
