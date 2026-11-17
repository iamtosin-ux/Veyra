import { HttpError, requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { z } from "zod";
import { SOURCE_LABEL, addRecording, caseFromRecordings, listRecordings, recordingsFolder, type RecordingSource } from "@/server/recordings";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ recordings: listRecordings(user), folderId: recordingsFolder(user) });
});

/** One case from several recordings at once. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser();
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(50) }).parse(await req.json());
  return Response.json(caseFromRecordings(user, ids), { status: 201 });
});

/** A finished recording: the audio file and where it was captured. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  const source = String(form.get("source") ?? "in_person") as RecordingSource;
  if (!(file instanceof File)) throw new HttpError(400, "No recording attached");
  if (!(source in SOURCE_LABEL)) throw new HttpError(400, "Unknown source");
  const id = addRecording(user, file.name, Buffer.from(await file.arrayBuffer()), source);
  return Response.json({ id }, { status: 201 });
});
