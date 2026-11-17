import { z } from "zod";
import { requireUser } from "@/server/auth";
import { caseSummary, deleteCase, getCaseForUser, trashCase, updateCase } from "@/server/cases";
import { listEvidence } from "@/server/evidence";
import { all, get } from "@/server/db";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  const c = getCaseForUser(user, caseId);
  const runs = all(
    `SELECT r.id, r.scope, r.status, r.stage, r.evidence_id, e.reference evidence_reference, r.error_details, r.created_at, r.started_at, r.completed_at
       FROM analysis_runs r LEFT JOIN evidence e ON e.id = r.evidence_id
      WHERE r.case_id = ? ORDER BY r.created_at DESC LIMIT 30`,
    caseId,
  );
  const latestCaseRun = get(
    "SELECT id, status, stage, error_details, completed_at, processing_configuration FROM analysis_runs WHERE case_id = ? AND scope = 'case' ORDER BY created_at DESC LIMIT 1",
    caseId,
  );
  return Response.json({ case: caseSummary(c), evidence: listEvidence(caseId), runs, latestCaseRun: latestCaseRun ?? null });
});

const Patch = z.object({ title: z.string().trim().min(1).max(300).optional(), description: z.string().max(5000).optional(), pinned: z.boolean().optional(), project_id: z.string().nullable().optional(), archived: z.boolean().optional(), industry: z.string().max(100).nullable().optional(), canvas_template: z.string().max(60).nullable().optional() });

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  return Response.json({ case: caseSummary(updateCase(user, caseId, Patch.parse(await req.json()))) });
});

/** Moves the case to the trash; with ?permanent=1, erases a case already in the trash. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    const { confirmReference } = z.object({ confirmReference: z.string() }).parse(await req.json());
    deleteCase(user, caseId, confirmReference);
  } else trashCase(user, caseId);
  return Response.json({ ok: true });
});
