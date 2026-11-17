import fs from "node:fs";
import { requireUser, HttpError } from "@/server/auth";
import { getEvidenceForUser } from "@/server/evidence";
import { derivedFilePath, readDerived } from "@/server/storage";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Derived analysis artefacts (sampled frames). Separate from, and never replacing, the original. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const e = getEvidenceForUser(user, evidenceId);
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[\w-]+\/[\w-]+\.jpg$/.test(rel)) throw new HttpError(400, "Invalid path");
  const file = derivedFilePath(e.id, rel);
  if (!fs.existsSync(file)) throw new HttpError(404, "Not found");
  return new Response(new Uint8Array(readDerived(file)), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
