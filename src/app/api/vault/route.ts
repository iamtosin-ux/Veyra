import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createFolder } from "@/server/cases";
import { RELATIONSHIPS, vaultFolders } from "@/server/invites";
import { handle } from "@/server/http";

/** Top-level vault folders, or the subfolders of ?parent=. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const parent = new URL(req.url).searchParams.get("parent") || null;
  return Response.json({ folders: vaultFolders(user, parent), relationships: RELATIONSHIPS });
});

/** A new vault folder, at the top level or inside another folder. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { name, parentId } = z.object({ name: z.string().trim().min(1, "Name the folder").max(200), parentId: z.string().nullable().default(null) }).parse(await req.json());
  return Response.json({ folder: createFolder(user, name, { parentId }) }, { status: 201 });
});
