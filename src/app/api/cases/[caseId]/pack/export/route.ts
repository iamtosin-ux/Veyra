import { requireUser, HttpError } from "@/server/auth";
import { buildReviewedOnly, getCasePack } from "@/server/casepack";
import { casePackToDocx } from "@/server/casepackDocx";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? undefined;
  // reviewed=1: accepted and corrected findings only, assembled now (not saved as a version).
  const pack = url.searchParams.get("reviewed") === "1" ? { content: buildReviewedOnly(user, caseId) } : getCasePack(user, caseId, id);
  if (!pack) throw new HttpError(404, "No case pack version yet");
  const buf = await casePackToDocx(pack.content);
  const name = `${pack.content.case_reference}-case-pack-v${pack.content.version}${pack.content.include_unreviewed ? "-DRAFT" : ""}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
