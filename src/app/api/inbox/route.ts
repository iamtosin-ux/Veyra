import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { listInbox, markInboxRead } from "@/server/inbox";

export const GET = handle(async () => Response.json(listInbox(await requireUser())));

/** Marks everything in the inbox as read. */
export const POST = handle(async () => {
  markInboxRead(await requireUser());
  return Response.json({ ok: true });
});
