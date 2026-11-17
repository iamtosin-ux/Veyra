import { requireUser } from "@/server/auth";
import { draftReplacementNote } from "@/server/integrityReview";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** A suggested note asking the contributor for the original. The reviewer edits it before sending. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  return Response.json(await draftReplacementNote(user, evidenceId));
});
