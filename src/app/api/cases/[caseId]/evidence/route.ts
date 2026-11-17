import { requireUser, HttpError } from "@/server/auth";
import { addEvidence } from "@/server/evidence";
import { getCaseForUser } from "@/server/cases";
import { handle } from "@/server/http";
import { CATEGORIES, type Category } from "@/lib/compliance";

type Ctx = { params: Promise<{ caseId: string }> };

/** Multipart upload of one or more files. Each file is validated and stored independently. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected multipart form data");
  });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new HttpError(400, "No files supplied");
  // What the uploader says about the files. Recorded as declared, not verified.
  const declaredSource = String(form.get("declared_source") ?? "").slice(0, 300) || null;
  const cat = String(form.get("declared_category") ?? "");
  const declaredCategory = (CATEGORIES as readonly string[]).includes(cat) ? (cat as Category) : null;
  const results = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    results.push(addEvidence(user, caseId, file.name, bytes, { declaredSource, declaredCategory }));
  }
  return Response.json({ results }, { status: results.some((r) => r.ok) ? 201 : 400 });
});
