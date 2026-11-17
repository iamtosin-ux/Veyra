import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { listEvidence } from "@/server/evidence";
import { folderPath, vaultFolders } from "@/server/invites";
import { get } from "@/server/db";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ folderId: string }> };

/** A vault folder: where it sits, its subfolders and its files. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { folderId } = await params;
  const f = getCaseForUser(user, folderId, "folder");
  const ofCase = f.case_id ? get<{ id: string; title: string; reference: string }>("SELECT id, title, reference FROM cases WHERE id = ? AND deleted_at IS NULL", f.case_id) ?? null : null;
  return Response.json({
    folder: { id: f.id, title: f.title, parent_id: f.parent_id ?? null, case: ofCase },
    path: folderPath(user, f.id),
    subfolders: vaultFolders(user, f.id),
    files: listEvidence(f.id),
  });
});
