import { requireUser } from "@/server/auth";
import { all, parseJson } from "@/server/db";
import { getEvidenceForUser, publicEvidence } from "@/server/evidence";
import { listObservations } from "@/server/observations";
import { removeEvidence } from "@/server/integrityReview";
import { renameEvidence } from "@/server/evidence";
import { z } from "zod";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ evidenceId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const e = getEvidenceForUser(user, evidenceId);
  // Latest extraction of each kind from completed evidence runs.
  const rows = all<{ kind: string; content: string; quality: string; quality_note: string | null; created_at: string; analysis_run_id: string }>(
    `SELECT x.kind, x.content, x.quality, x.quality_note, x.created_at, x.analysis_run_id FROM extractions x
       JOIN analysis_runs r ON r.id = x.analysis_run_id
      WHERE x.evidence_id = ? AND r.status = 'completed' AND r.scope = 'evidence' ORDER BY x.created_at`,
    e.id,
  );
  const extractions: Record<string, { content: unknown; quality: string; quality_note: string | null; run_id: string }> = {};
  for (const r of rows) extractions[r.kind] = { content: parseJson(r.content, null), quality: r.quality, quality_note: r.quality_note, run_id: r.analysis_run_id };
  const runs = all(
    "SELECT id, scope, status, stage, error_details, created_at, completed_at FROM analysis_runs WHERE evidence_id = ? ORDER BY created_at DESC",
    e.id,
  );
  return Response.json({ evidence: publicEvidence(e), extractions, observations: listObservations({ evidenceId: e.id }), runs });
});

/** Remove this item, its file and everything derived from it. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  return Response.json(removeEvidence(user, evidenceId));
});

/** Rename: sets a display name; the original filename is never changed. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { evidenceId } = await params;
  const { display_name } = z.object({ display_name: z.string().max(255) }).parse(await req.json());
  renameEvidence(user, evidenceId, display_name);
  return Response.json({ ok: true });
});
