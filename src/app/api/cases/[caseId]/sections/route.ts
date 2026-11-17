import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { getSectionSettings, updateSectionSettings } from "@/server/collab";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  return Response.json({ settings: getSectionSettings(caseId) });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z
    .object({ section: z.string(), instructions: z.string().max(2000).optional(), citations: z.boolean().optional(), collapsed: z.boolean().optional(), hidden: z.boolean().optional() })
    .parse(await req.json());
  const { section, ...patch } = b;
  return Response.json({ settings: updateSectionSettings(user, caseId, section, patch) });
});
