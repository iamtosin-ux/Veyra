import { z } from "zod";
import { cookies } from "next/headers";
import { authenticate, HttpError } from "@/server/auth";
import { createSessionToken, SESSION_COOKIE } from "@/server/session";
import { handle } from "@/server/http";

const Body = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const { username, password } = Body.parse(await req.json());
  const user = authenticate(username, password);
  if (!user) throw new HttpError(401, "Username or password is incorrect");
  const { token, maxAgeSeconds } = createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds });
  return Response.json({ ok: true });
});
