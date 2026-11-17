import { z } from "zod";
import { requireUser } from "@/server/auth";
import { approveForAnalysis, evidenceCompliance, requestVerification, setCategory, setRestricted } from "@/server/compliance/review";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

/** Compliance, integrity and verification status for one item, with its processing history. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  return Response.json(evidenceCompliance(user, evidenceId));
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), reason: z.string().max(1000) }),
  z.object({ action: z.literal("category"), category: z.string() }),
  z.object({ action: z.literal("restrict"), reason: z.string().max(1000).default("") }),
  z.object({ action: z.literal("unrestrict") }),
  z.object({ action: z.literal("verify") }),
]);

/** Reviewer actions. Each is recorded in the audit trail. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const b = Body.parse(await req.json());
  if (b.action === "approve") return Response.json({ status: approveForAnalysis(user, evidenceId, b.reason) });
  if (b.action === "category") return Response.json({ status: setCategory(user, evidenceId, b.category) });
  if (b.action === "restrict") return Response.json({ status: setRestricted(user, evidenceId, true, b.reason) });
  if (b.action === "unrestrict") return Response.json({ status: setRestricted(user, evidenceId, false, "") });
  return Response.json(requestVerification(user, evidenceId));
});
