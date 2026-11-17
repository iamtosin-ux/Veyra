import { requireUser } from "@/server/auth";
import { activePolicy, approvePolicy, policyHistory } from "@/server/compliance/policy";
import { audit, refreshOrganisationCompliance } from "@/server/compliance/engine";
import { handle } from "@/server/http";

/** The organisation's approved processing policy and its version history. */
export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ policy: activePolicy(user.organisation_id), history: policyHistory(user), canApprove: user.role === "admin" });
});

/** Approve a new policy version. Future processing uses it; earlier results keep their version. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const policy = approvePolicy(user, await req.json());
  audit({
    organisationId: user.organisation_id,
    caseId: null,
    evidenceId: null,
    user,
    actor: user.name,
    operation: "policy_change",
    purpose: policy.config.purpose,
    policyId: policy.id,
    policyVersion: policy.version,
    decision: "RECORDED",
    reasons: [],
    explanation: `Processing policy version ${policy.version} approved.`,
    provider: null,
  });
  refreshOrganisationCompliance(user.organisation_id);
  return Response.json({ policy });
});
