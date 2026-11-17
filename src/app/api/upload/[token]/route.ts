import { HttpError } from "@/server/auth";
import { contributeEvidence, publicInvite } from "@/server/invites";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ token: string }> };

// Public: authorised by the invitation token only.
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { token } = await params;
  return Response.json(publicInvite(token));
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { token } = await params;
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart form data");
  });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const statement = String(form.get("statement") ?? "").slice(0, 50_000);
  if (files.length === 0 && !statement.trim()) throw new HttpError(400, "Add at least one file or a written statement");
  const results = contributeEvidence(
    token,
    { name: String(form.get("name") ?? "").slice(0, 200), email: String(form.get("email") ?? "").slice(0, 200), statement },
    await Promise.all(files.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) }))),
  );
  return Response.json({ results });
});
