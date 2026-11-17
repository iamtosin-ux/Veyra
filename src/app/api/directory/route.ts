import { requireUser } from "@/server/auth";
import { directory } from "@/server/collab";
import { handle } from "@/server/http";

export const GET = handle(async () => Response.json({ entries: directory(await requireUser()) }));
