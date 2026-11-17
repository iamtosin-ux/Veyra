import { requireUser } from "@/server/auth";
import { listTrash } from "@/server/cases";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ cases: listTrash(user) });
});
