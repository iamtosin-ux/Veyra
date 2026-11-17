import { all, get, now, run } from "./db";
import type { User } from "./auth";
import { sectionLabel } from "./collab";
import { myTasks, type Task, type TaskKind } from "./tasks";

/**
 * The inbox: what happened in Veyra that needs this person, derived from real
 * records rather than stored as messages. Review requests assigned to them,
 * cases shared with them, evidence contributors sent into their cases,
 * analysis that finished on them, and everything else waiting on them in their
 * cases (grouped per case and kind). Read state is one timestamp per person.
 */

export type InboxKind = "review" | "shared" | "owner" | "evidence" | "analysis" | "task";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** Who did it; null when Veyra did. */
  actor: string | null;
  /** What they did, read after the actor: "asked you to review". */
  verb: string;
  /** The thing it was done to, when it is not the case itself: a section. */
  object: string | null;
  case_id: string;
  case_title: string;
  /** A note, a message or the files, shown under the line. */
  snippet: string | null;
  at: string;
  unread: boolean;
  /** Where opening it goes inside the case. */
  target: { view?: string; section?: string };
  /** Only for items still waiting on this person: what to do. Updates that need nothing have none. */
  action?: string;
}

const ROLE: Record<string, string> = { manager: "case manager", editor: "editor", viewer: "viewer" };
const LIMIT = 40;

const title = (t: string) => t.replace(/^DEMO · /, "");

/** Cases this person owns or was added to: the ones whose activity is theirs to hear about. */
const MINE = `(c.created_by = ? OR EXISTS (SELECT 1 FROM case_members m WHERE m.case_id = c.id AND m.user_id = ?))`;

export function inboxSeenAt(user: User): string {
  return get<{ inbox_seen_at: string | null }>("SELECT inbox_seen_at FROM users WHERE id = ?", user.id)?.inbox_seen_at ?? "";
}

export function listInbox(user: User): { items: InboxItem[]; unread: number } {
  const seen = inboxSeenAt(user);
  const items: Omit<InboxItem, "unread">[] = [];

  // Review requests assigned to this person by someone else
  for (const a of all<{ id: string; case_id: string; section: string; note: string; created_at: string; by: string | null; case_title: string }>(
    `SELECT a.id, a.case_id, a.section, a.note, a.created_at, u.name by, c.title case_title
       FROM section_assignments a JOIN cases c ON c.id = a.case_id LEFT JOIN users u ON u.id = a.created_by
      WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND a.status = 'open'
        AND (a.assignee_user_id = ? OR lower(a.assignee) = lower(?)) AND (a.created_by IS NULL OR a.created_by != ?)`,
    user.organisation_id,
    user.id,
    user.name,
    user.id,
  )) {
    items.push({
      id: `review:${a.id}`,
      kind: "review",
      actor: a.by,
      verb: "asked you to review",
      object: sectionLabel(a.case_id, a.section) ?? a.section,
      case_id: a.case_id,
      case_title: title(a.case_title),
      snippet: a.note.trim() || null,
      at: a.created_at,
      target: { section: a.section },
      action: "Review section",
    });
  }

  // Cases shared with this person
  for (const m of all<{ id: string; case_id: string; role: string; invited_at: string; by: string | null; case_title: string }>(
    `SELECT m.id, m.case_id, m.role, m.invited_at, u.name by, c.title case_title
       FROM case_members m JOIN cases c ON c.id = m.case_id LEFT JOIN users u ON u.id = m.invited_by
      WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND m.user_id = ? AND (m.invited_by IS NULL OR m.invited_by != ?)`,
    user.organisation_id,
    user.id,
    user.id,
  )) {
    items.push({
      id: `shared:${m.id}`,
      kind: "shared",
      actor: m.by,
      verb: `added you as ${ROLE[m.role] ?? m.role} to`,
      object: null,
      case_id: m.case_id,
      case_title: title(m.case_title),
      snippet: null,
      at: m.invited_at,
      target: {},
    });
  }

  // Cases someone else made this person the owner of
  for (const c of all<{ id: string; title: string; at: string; by: string | null }>(
    `SELECT c.id, c.title, c.transferred_at at, u.name by
       FROM cases c LEFT JOIN users u ON u.id = c.transferred_by
      WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND c.created_by = ? AND c.transferred_by IS NOT NULL AND c.transferred_by != ? AND c.transferred_at IS NOT NULL`,
    user.organisation_id,
    user.id,
    user.id,
  )) {
    items.push({
      id: `owner:${c.id}:${c.at}`,
      kind: "owner",
      actor: c.by,
      verb: "made you the owner of",
      object: null,
      case_id: c.id,
      case_title: title(c.title),
      snippet: null,
      at: c.at,
      target: {},
    });
  }

  // Evidence contributors sent in by link or email, one item per sender per case per day
  for (const e of all<{ case_id: string; case_title: string; who: string | null; source: string; day: string; at: string; n: number; files: string; subject: string | null; waiting: number }>(
    `SELECT e.case_id, c.title case_title,
            coalesce(json_extract(e.metadata, '$.contributor_name'), json_extract(e.metadata, '$.contributor_email'), json_extract(e.metadata, '$.invite_label')) who,
            json_extract(e.metadata, '$.upload_source') source, substr(e.uploaded_at, 1, 10) day, max(e.uploaded_at) at, count(*) n,
            group_concat(e.original_filename, ', ') files, max(json_extract(e.metadata, '$.email_subject')) subject,
            sum(CASE WHEN e.processing_status IN ('pending', 'failed') THEN 1 ELSE 0 END) waiting
       FROM evidence e JOIN cases c ON c.id = e.case_id
      WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND c.kind = 'case' AND ${MINE}
        AND json_extract(e.metadata, '$.upload_source') IN ('invite', 'email')
      GROUP BY e.case_id, who, source, day
      ORDER BY at DESC LIMIT ?`,
    user.organisation_id,
    user.id,
    user.id,
    LIMIT,
  )) {
    items.push({
      id: `evidence:${e.case_id}:${e.who ?? ""}:${e.day}`,
      kind: "evidence",
      actor: e.who ?? "A contributor",
      verb: `${e.source === "email" ? "emailed" : "sent"} ${e.n} ${e.n === 1 ? "item" : "items"} to`,
      object: null,
      case_id: e.case_id,
      case_title: title(e.case_title),
      snippet: e.subject ? `“${e.subject}”` : e.files,
      at: e.at,
      target: { view: "evidence" },
      // Waiting while any of it is still to be checked and analysed.
      action: e.waiting > 0 ? "Check evidence" : undefined,
    });
  }

  // Case analysis that finished, the latest run on each case
  for (const r of all<{ case_id: string; case_title: string; at: string; findings: number; unreviewed: number }>(
    `SELECT r.case_id, c.title case_title, max(r.completed_at) at,
            (SELECT count(*) FROM findings f WHERE f.case_id = r.case_id AND f.superseded = 0 AND f.archived_at IS NULL) findings,
            (SELECT count(*) FROM findings f WHERE f.case_id = r.case_id AND f.superseded = 0 AND f.archived_at IS NULL AND f.review_status = 'unreviewed') unreviewed
       FROM analysis_runs r JOIN cases c ON c.id = r.case_id
      WHERE c.organisation_id = ? AND c.deleted_at IS NULL AND c.kind = 'case' AND ${MINE}
        AND r.status = 'completed' AND r.evidence_id IS NULL AND r.completed_at IS NOT NULL
      GROUP BY r.case_id
      ORDER BY at DESC LIMIT ?`,
    user.organisation_id,
    user.id,
    user.id,
    LIMIT,
  )) {
    items.push({
      id: `analysis:${r.case_id}:${r.at}`,
      kind: "analysis",
      actor: null,
      verb: "finished analysing",
      object: null,
      case_id: r.case_id,
      case_title: title(r.case_title),
      snippet: r.unreviewed > 0 ? `${r.unreviewed} ${r.unreviewed === 1 ? "finding" : "findings"} ready to review` : `${r.findings} ${r.findings === 1 ? "finding" : "findings"}, all reviewed`,
      at: r.at,
      target: { view: "insights" },
      action: r.unreviewed > 0 ? "Review findings" : undefined,
    });
  }

  // Everything else waiting on this person, one item per case and kind of work. Review
  // requests are already listed above, and so are findings once an analysis has reported them.
  const reported = new Set(items.filter((i) => i.kind === "analysis").map((i) => i.case_id));
  for (const g of myTasks(user).groups) {
    const byKind = new Map<TaskKind, Task[]>();
    for (const t of g.tasks) if (t.kind !== "review_request") byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t]);
    for (const [kind, tasks] of byKind) {
      if (kind === "finding_review" && reported.has(g.case_id)) continue;
      const line = TASK_LINE[kind];
      if (!line) continue;
      items.push({
        id: `task:${g.case_id}:${kind}`,
        kind: "task",
        actor: null,
        verb: line.verb,
        object: line.object(tasks.length),
        case_id: g.case_id,
        case_title: g.case_title,
        snippet: tasks.slice(0, 3).map((t) => t.title).join(" · ") + (tasks.length > 3 ? ` and ${tasks.length - 3} more` : ""),
        at: latest(kind, tasks) ?? "",
        target: kind === "finding_review" ? { view: "insights" } : kind === "web_approval" ? { section: tasks[0]!.target.section } : { view: "evidence" },
      });
    }
  }

  const sorted = items
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, LIMIT)
    .map((i) => ({ ...i, unread: i.at > seen }));
  return { items: sorted, unread: sorted.filter((i) => i.unread).length };
}

/** Everything up to now has been seen. */
export function markInboxRead(user: User) {
  run("UPDATE users SET inbox_seen_at = ? WHERE id = ?", now(), user.id);
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How each kind of waiting work reads in the inbox: "Veyra flagged 3 findings to review in …". */
const TASK_LINE: Partial<Record<TaskKind, { verb: string; object: (count: number) => string }>> = {
  finding_review: { verb: "has", object: (c) => `${n(c, "finding")} to review` },
  web_approval: { verb: "found", object: (c) => `${n(c, "web source")} to approve` },
  integrity: { verb: "flagged", object: (c) => `${n(c, "item")} with integrity indicators` },
  failed: { verb: "couldn't process", object: (c) => n(c, "evidence item") },
  not_analysed: { verb: "hasn't analysed", object: (c) => n(c, "evidence item") },
};

/** When the newest piece of this work appeared, so it sorts and counts as unread like everything else. */
function latest(kind: TaskKind, tasks: Task[]): string | null {
  const ids = tasks.map((t) => t.id.slice(2));
  const marks = ids.map(() => "?").join(",");
  const sql =
    kind === "finding_review"
      ? `SELECT max(created_at) at FROM findings WHERE id IN (${marks})`
      : kind === "web_approval"
        ? `SELECT max(retrieved_at) at FROM web_sources WHERE id IN (${marks})`
        : `SELECT max(uploaded_at) at FROM evidence WHERE id IN (${marks})`;
  return get<{ at: string | null }>(sql, ...ids)?.at ?? null;
}
