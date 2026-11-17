import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { caseFromRecordings, copyRecordingTo, dismissRecording } from "@/server/recordings";

type Ctx = { params: Promise<{ recordingId: string }> };

/** Start a case from the recording, copy it into a vault folder, or stop suggesting it. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { recordingId } = await params;
  const b = z.discriminatedUnion("action", [z.object({ action: z.literal("case") }), z.object({ action: z.literal("dismiss") }), z.object({ action: z.literal("copy"), folderId: z.string() })]).parse(await req.json());
  if (b.action === "dismiss") {
    dismissRecording(user, recordingId);
    return Response.json({ ok: true });
  }
  if (b.action === "copy") return Response.json(copyRecordingTo(user, recordingId, b.folderId), { status: 201 });
  const { caseId, evidenceIds } = caseFromRecordings(user, [recordingId]);
  return Response.json({ caseId, evidenceId: evidenceIds[0] }, { status: 201 });
});
