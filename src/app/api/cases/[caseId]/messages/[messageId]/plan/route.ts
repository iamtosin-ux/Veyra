import { z } from "zod";
import { requireUser } from "@/server/auth";
import { decidePlan } from "@/server/workflows";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string; messageId: string }> };

const Body = z.object({ decision: z.enum(["approve", "dismiss", "restore"]), steps: z.array(z.string()).max(10).optional() });

/** The user's answer to a plan Veyra proposed: approving it starts the workflow run. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId, messageId } = await params;
  const b = Body.parse(await req.json());
  return Response.json({ plan: decidePlan(user, caseId, messageId, b.decision, b.steps) });
});
