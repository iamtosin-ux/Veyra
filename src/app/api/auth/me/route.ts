import { requireUser } from "@/server/auth";
import { get } from "@/server/db";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  const org = get<{ name: string }>("SELECT name FROM organisations WHERE id = ?", user.organisation_id);
  return Response.json({ user, organisation: org?.name ?? "", aiConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) });
});
