import { requireUser } from "@/server/auth";
import { getCaseForUser } from "@/server/cases";
import { all } from "@/server/db";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ caseId: string }> };

/** Analysis history with AI usage and rejected (unsupported) AI claims, for transparency and cost tracking. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { caseId } = await params;
  getCaseForUser(user, caseId);
  const runs = all(
    `SELECT r.id, r.scope, r.status, r.stage, r.model_identifier, r.processing_configuration, r.error_details, r.created_at, r.started_at, r.completed_at,
            e.reference evidence_reference,
            COALESCE(SUM(u.input_tokens),0) input_tokens, COALESCE(SUM(u.output_tokens),0) output_tokens,
            COALESCE(SUM(u.cache_read_tokens),0) cache_read_tokens, COALESCE(SUM(u.images_sent),0) images_sent,
            COALESCE(SUM(u.media_seconds),0) media_seconds, COALESCE(SUM(u.duration_ms),0) ai_ms,
            (SELECT COUNT(*) FROM validation_rejections v WHERE v.analysis_run_id = r.id) rejections
       FROM analysis_runs r
       LEFT JOIN evidence e ON e.id = r.evidence_id
       LEFT JOIN ai_usage u ON u.analysis_run_id = r.id
      WHERE r.case_id = ?
      GROUP BY r.id ORDER BY r.created_at DESC`,
    caseId,
  );
  const rejections = all(
    `SELECT v.analysis_run_id, v.item_kind, v.reason, v.payload, v.created_at FROM validation_rejections v
       JOIN analysis_runs r ON r.id = v.analysis_run_id WHERE r.case_id = ? ORDER BY v.created_at DESC`,
    caseId,
  );
  return Response.json({ runs, rejections });
});
