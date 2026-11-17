import { z } from "zod";
import { requireUser } from "@/server/auth";
import { linkVaultFiles } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Use files already in the vault as evidence in this case. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(200) }).parse(await req.json());
  const results = linkVaultFiles(user, caseId, ids);
  return Response.json({ results }, { status: results.some((r) => r.ok) ? 201 : 400 });
});
