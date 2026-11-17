import { requireUser, HttpError } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { get } from "@/server/db";
import { inboxAddress } from "@/server/invites";
import { ingestEmail } from "@/server/inboundEmail";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; inviteId: string }> };

/** Send a test email to one of this case's upload requests, as if it came from the contributor. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, inviteId } = await params;
  getCaseForUser(user, caseId);
  const inv = get<{ inbox_key: string | null }>("SELECT inbox_key FROM upload_invites WHERE id = ? AND case_id = ?", inviteId, caseId);
  if (!inv?.inbox_key) throw new HttpError(404, "Upload request not found");
  const form = await req.formData();
  const text = String(form.get("text") ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  return Response.json(
    ingestEmail({
      from: String(form.get("from") ?? "").trim().toLowerCase() || "contributor@example.com",
      fromName: String(form.get("fromName") ?? "").trim() || null,
      to: [inboxAddress(inv.inbox_key)],
      subject: String(form.get("subject") ?? "").trim() || "(no subject)",
      date: new Date().toUTCString(),
      text,
      attachments: await Promise.all(files.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()), contentType: f.type || null, inline: false }))),
    }),
  );
});
