import { requireUser, usageSummary } from "@/server/auth";
import { handle } from "@/server/http";

export const GET = handle(async () => Response.json({ usage: usageSummary(await requireUser()) }));
