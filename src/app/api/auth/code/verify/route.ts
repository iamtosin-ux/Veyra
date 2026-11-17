import { z } from "zod";
import { cookies } from "next/headers";
import { verifyLoginCode } from "@/server/loginCodes";
import { createSessionToken, SESSION_COOKIE } from "@/server/session";
import { handle } from "@/server/http";

export const POST = handle(async (req: Request) => {
  const { email, code } = z.object({ email: z.string().trim().max(200), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(await req.json());
  const userId = verifyLoginCode(email, code);
  const { token, maxAgeSeconds } = createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds });
  return Response.json({ ok: true });
});
