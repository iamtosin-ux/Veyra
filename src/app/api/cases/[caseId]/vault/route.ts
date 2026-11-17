import { z } from "zod";
import { requireUser } from "@/server/auth";
import { resolveVaultOffer } from "@/server/assistant/assistant";
import { fileToVault } from "@/server/evidence";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/**
 * Add this case's files to the vault (its own folder unless another is chosen),
 * or decline Veyra's offer to. `messageId` is the chat message that made the offer.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const b = z
    .object({ evidenceIds: z.array(z.string()).max(200).default([]), folderId: z.string().nullable().default(null), messageId: z.string().nullable().default(null), dismiss: z.boolean().default(false) })
    .parse(await req.json());
  if (b.dismiss) {
    if (b.messageId) resolveVaultOffer(user, caseId, b.messageId, { status: "dismissed" });
    return Response.json({ ok: true });
  }
  const out = fileToVault(user, caseId, b.evidenceIds, b.folderId);
  if (b.messageId) resolveVaultOffer(user, caseId, b.messageId, { status: "added", folder: out.folder });
  return Response.json(out, { status: 201 });
});
