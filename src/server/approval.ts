import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { generateCasePack } from "./casepack";
import { postMessage } from "./assistant/assistant";

// Approving a case pack signs off a version that contains only findings a
// reviewer has accepted or corrected. Anything still open is reported first.

export function approvalStatus(user: User, caseId: string) {
  getCaseForUser(user, caseId);
  const n = (sql: string) => Number(get<{ n: number }>(sql, caseId)?.n ?? 0);
  const reviewed = n("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status IN ('accepted','corrected')");
  const unreviewed = n("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status = 'unreviewed'");
  const reviewRequests = n("SELECT COUNT(*) n FROM section_assignments WHERE case_id = ? AND status = 'open'");
  const webPending = n("SELECT COUNT(*) n FROM web_sources WHERE case_id = ? AND status = 'proposed'");
  const processing = n("SELECT COUNT(*) n FROM evidence WHERE case_id = ? AND processing_status IN ('queued','processing')");
  const last = get<{ id: string; version: number; approved_at: string; approved_by_name: string | null }>(
    `SELECT p.id, p.version, p.approved_at, u.name approved_by_name FROM case_packs p LEFT JOIN users u ON u.id = p.approved_by
      WHERE p.case_id = ? AND p.approved_at IS NOT NULL ORDER BY p.version DESC LIMIT 1`,
    caseId,
  );
  return { reviewed, unreviewed, reviewRequests, webPending, processing, lastApproval: last ?? null };
}

export function approveCasePack(user: User, caseId: string) {
  const status = approvalStatus(user, caseId);
  if (status.reviewed === 0) throw new HttpError(400, "Review at least one finding before approving");
  const pack = generateCasePack(user, caseId, false)!;
  const ts = now();
  run("UPDATE case_packs SET approved_by = ?, approved_at = ?, review_status = 'approved' WHERE id = ?", user.id, ts, pack.id);
  touchCase(caseId);
  const open = [
    status.unreviewed ? `${status.unreviewed} unreviewed finding(s) were left out` : "",
    status.reviewRequests ? `${status.reviewRequests} section review request(s) were still open` : "",
    status.webPending ? `${status.webPending} web source(s) were awaiting approval` : "",
  ].filter(Boolean);
  postMessage(
    caseId,
    "assistant",
    {
      text: `Case pack **version ${pack.content.version}** approved by ${user.name}. It includes ${status.reviewed} reviewed finding(s).${open.length ? `\n\nAt approval: ${open.join("; ")}.` : ""}`,
      packUpdate: [`Approved version ${pack.content.version}`],
    },
    user.id,
  );
  return { id: pack.id, version: pack.content.version, approved_at: ts };
}

export function approvals(caseId: string) {
  return all<{ id: string; version: number; approved_at: string }>("SELECT id, version, approved_at FROM case_packs WHERE case_id = ? AND approved_at IS NOT NULL ORDER BY version DESC", caseId);
}
