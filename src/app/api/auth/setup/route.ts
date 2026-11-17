import { z } from "zod";
import { cookies } from "next/headers";
import { createInitialAdmin, hasAnyUser } from "@/server/auth";
import { createSessionToken, SESSION_COOKIE } from "@/server/session";
import { handle } from "@/server/http";

const Body = z.object({
  organisation: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(64).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  password: z.string().min(5, "Password must be at least 5 characters"),
});

// Google sign-in needs an OAuth client registered with Google; until then the page says so.
export const GET = handle(async () => Response.json({ needsSetup: !hasAnyUser(), google: !!process.env.GOOGLE_CLIENT_ID }));

export const POST = handle(async (req: Request) => {
  const body = Body.parse(await req.json());
  const user = createInitialAdmin(body);
  const { token, maxAgeSeconds } = createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds });
  return Response.json({ ok: true });
});
