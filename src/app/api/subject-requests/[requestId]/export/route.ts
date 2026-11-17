import { requireUser } from "@/server/auth";
import { exportRequest } from "@/server/compliance/subjects";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ requestId: string }> };

/** Download the access export. Review it for other people's information before sending. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { requestId } = await params;
  const { filename, bytes } = await exportRequest(user, requestId);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
});
