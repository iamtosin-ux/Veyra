import { z } from "zod";
import { getProfile, requireUser, updateProfile } from "@/server/auth";
import { cookies } from "next/headers";
import { deleteAccount } from "@/server/account";
import { handle } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

export const GET = handle(async () => Response.json({ profile: getProfile(await requireUser()) }));

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const b = z.object({ name: z.string().trim().min(1).max(200).optional(), email: z.string().trim().max(200).nullable().optional(), organisation: z.string().trim().min(1).max(200).optional(), ai_training: z.boolean().optional(), email_notifications: z.boolean().optional() }).parse(await req.json());
  return Response.json({ profile: updateProfile(user, b) });
});

/** Close your own account and sign out. The body must confirm with the word DELETE. */
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser();
  z.object({ confirm: z.literal("DELETE") }).parse(await req.json());
  deleteAccount(user);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
