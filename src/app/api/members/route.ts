import { requireUser } from "@/server/auth";
import { all } from "@/server/db";
import { handle } from "@/server/http";

/** People and teams in the signed-in user's workspace. */
export const GET = handle(async () => {
  const user = await requireUser();
  const members = all<{ id: string; name: string; email: string; username: string | null; role: string; created_at: string }>(
    "SELECT id, name, email, username, role, created_at FROM users WHERE organisation_id = ? ORDER BY role = 'admin' DESC, name",
    user.organisation_id,
  ).map((m) => ({ ...m, email: m.email.endsWith("@local.invalid") ? null : m.email, you: m.id === user.id }));
  const teams = all<{ id: string; name: string }>("SELECT id, name FROM teams WHERE organisation_id = ? ORDER BY name", user.organisation_id);
  return Response.json({ members, teams });
});
