import crypto from "node:crypto";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { storeEvidence, type UploadResult } from "./evidence";

// Upload invitations: a private, expiring link that lets someone without an
// account add evidence to one case folder. Only a hash of the token is stored.

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

// Who an invitee is in the case. A label only: it grants nothing.
export const RELATIONSHIPS = ["Complainant", "Claimant", "Respondent", "Witness", "Expert", "Victim", "Tenant", "Employee", "Family member", "Other"] as const;

/** The address mail can be sent to for one upload request. */
export function inboxAddress(key: string) {
  return `evidence+${key}@${process.env.VEYRA_INBOUND_DOMAIN || "inbox.veyra.local"}`;
}

export function createInvite(user: User, caseId: string, input: { label: string; message: string; days: number; relationship?: string | null; contact?: string | null }) {
  getCaseForUser(user, caseId);
  const token = crypto.randomBytes(24).toString("base64url");
  const inboxKey = crypto.randomBytes(9).toString("hex");
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + Math.min(Math.max(input.days, 1), 90) * 86_400_000).toISOString();
  run(
    "INSERT INTO upload_invites (id, case_id, token_hash, label, message, expires_at, created_by, created_at, relationship, contact, inbox_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    caseId,
    hashToken(token),
    input.label.trim() || "Evidence request",
    input.message.trim(),
    expires,
    user.id,
    now(),
    input.relationship?.trim() || null,
    input.contact?.trim() || null,
    inboxKey,
  );
  // The raw token is returned once; it cannot be recovered later.
  return { id, token, expires_at: expires, email: inboxAddress(inboxKey) };
}

/**
 * Invites to a case. `team` marks invitees whose email belongs to someone in this workspace;
 * `name` is that member's name, or the name a contributor gave when uploading.
 */
export function listInvites(user: User, caseId: string) {
  getCaseForUser(user, caseId);
  const members = new Map(all<{ email: string; name: string }>("SELECT email, name FROM users WHERE organisation_id = ?", user.organisation_id).map((u) => [u.email.toLowerCase(), u.name]));
  return all<{ id: string; label: string; message: string; relationship: string | null; contact: string | null; expires_at: string; revoked_at: string | null; uploads: number; created_at: string; contributor: string | null; inbox_key: string | null }>(
    `SELECT i.id, i.label, i.message, i.relationship, i.contact, i.expires_at, i.revoked_at, i.uploads, i.created_at, i.inbox_key,
            (SELECT json_extract(e.metadata, '$.contributor_name') FROM evidence e
              WHERE e.case_id = i.case_id AND json_extract(e.metadata, '$.invite_id') = i.id AND json_extract(e.metadata, '$.contributor_name') IS NOT NULL
              ORDER BY e.uploaded_at DESC LIMIT 1) contributor
       FROM upload_invites i WHERE i.case_id = ? ORDER BY i.created_at DESC`,
    caseId,
  ).map(({ contributor, inbox_key, ...i }) => {
    const member = i.contact ? members.get(i.contact.toLowerCase()) : undefined;
    return { ...i, email: inbox_key ? inboxAddress(inbox_key) : null, active: !i.revoked_at && i.expires_at > now(), team: member !== undefined, name: member ?? contributor };
  });
}

/** The person who created the case, shown first in the collaborators list. */
export function caseOwner(user: User, caseId: string) {
  getCaseForUser(user, caseId);
  const o = get<{ id: string; name: string; email: string }>("SELECT u.id, u.name, u.email FROM cases c JOIN users u ON u.id = c.created_by WHERE c.id = ?", caseId);
  return o ? { name: o.name, email: o.email.endsWith("@local.invalid") ? null : o.email, you: o.id === user.id } : null;
}

export function setInviteRole(user: User, caseId: string, inviteId: string, role: string | null) {
  getCaseForUser(user, caseId);
  run("UPDATE upload_invites SET relationship = ? WHERE id = ? AND case_id = ?", role?.trim() || null, inviteId, caseId);
}

export function revokeInvite(user: User, caseId: string, inviteId: string) {
  getCaseForUser(user, caseId);
  run("UPDATE upload_invites SET revoked_at = ? WHERE id = ? AND case_id = ? AND revoked_at IS NULL", now(), inviteId, caseId);
}

interface InviteRow {
  id: string;
  relationship: string | null;
  case_id: string;
  label: string;
  message: string;
  expires_at: string;
  revoked_at: string | null;
}

/** Resolve a public token to its invite, or fail without revealing why. */
function resolve(token: string): InviteRow {
  const inv = get<InviteRow>("SELECT id, case_id, label, message, relationship, expires_at, revoked_at FROM upload_invites WHERE token_hash = ?", hashToken(token));
  // A link into a case that has been moved to the trash stops working with it.
  const live = inv && get("SELECT id FROM cases WHERE id = ? AND deleted_at IS NULL", inv.case_id);
  if (!inv || !live || inv.revoked_at || inv.expires_at <= now()) throw new HttpError(404, "This upload link is invalid or has expired.");
  return inv;
}

/** What an invited contributor may see: the folder title and the request message only. */
export function publicInvite(token: string) {
  const inv = resolve(token);
  const c = get<{ title: string }>("SELECT title FROM cases WHERE id = ?", inv.case_id);
  return { folder: (c?.title ?? "Case folder").replace(/^DEMO · /, ""), label: inv.label, message: inv.message, expires_at: inv.expires_at };
}

export function contributeEvidence(token: string, contributor: { name: string; email: string; statement: string }, files: { name: string; bytes: Buffer }[]) {
  const inv = resolve(token);
  const metadata = { upload_source: "invite", invite_id: inv.id, invite_label: inv.label, relationship: inv.relationship, contributor_name: contributor.name.trim() || null, contributor_email: contributor.email.trim() || null };
  const results: UploadResult[] = files.slice(0, 20).map((f) => storeEvidence(null, inv.case_id, f.name, f.bytes, { metadata }));
  if (contributor.statement.trim()) {
    // Written statements become a written account attributed to the contributor.
    const r = storeEvidence(null, inv.case_id, `Statement - ${(contributor.name || "contributor").replace(/[^\w\- ]+/g, "").slice(0, 60)}.txt`, Buffer.from(contributor.statement.trim(), "utf8"), {
      type: "written_account",
      metadata: { ...metadata, stated_author: contributor.name.trim() || null },
    });
    results.push(r);
  }
  const ok = results.filter((r) => r.ok).length;
  if (ok) {
    run("UPDATE upload_invites SET uploads = uploads + ? WHERE id = ?", ok, inv.id);
    touchCase(inv.case_id);
  }
  return results.map((r) => (r.ok ? { filename: r.filename, ok: true } : { filename: r.filename, ok: false, error: r.error }));
}

/**
 * Vault folders at one level: top-level folders by default, or the subfolders
 * of `parentId`. Case folders carry the case they belong to.
 */
export function vaultFolders(user: User, parentId: string | null = null) {
  return all<{ id: string; title: string; reference: string; created_at: string; updated_at: string; is_demo: number; pinned: number; archived: number; files: number; bytes: number; invites: number; contributed: number; subfolders: number; case_id: string | null; case_title: string | null; case_reference: string | null }>(
    `SELECT c.id, c.title, c.reference, c.created_at, c.updated_at, c.is_demo, c.pinned, c.archived, c.case_id, k.title case_title, k.reference case_reference,
            (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id) files,
            (SELECT COALESCE(SUM(file_size), 0) FROM evidence e WHERE e.case_id = c.id) bytes,
            (SELECT COUNT(*) FROM upload_invites i WHERE i.case_id = c.id AND i.revoked_at IS NULL AND i.expires_at > ?) invites,
            (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id AND json_extract(e.metadata, '$.upload_source') = 'invite') contributed,
            (SELECT COUNT(*) FROM cases s WHERE s.parent_id = c.id AND s.deleted_at IS NULL) subfolders
       FROM cases c LEFT JOIN cases k ON k.id = c.case_id AND k.deleted_at IS NULL
      WHERE c.organisation_id = ? AND c.kind = 'folder' AND c.parent_id IS ? AND c.deleted_at IS NULL ORDER BY c.pinned DESC, c.updated_at DESC`,
    now(),
    user.organisation_id,
    parentId,
  ).map((f) => ({ ...f, is_demo: !!f.is_demo, pinned: !!f.pinned, archived: !!f.archived }));
}

/** A folder's ancestors, outermost first, for breadcrumbs. */
export function folderPath(user: User, folderId: string) {
  const path: { id: string; title: string }[] = [];
  let id: string | null | undefined = getCaseForUser(user, folderId, "folder").parent_id;
  while (id && path.length < 20) {
    const p = get<{ id: string; title: string; parent_id: string | null }>("SELECT id, title, parent_id FROM cases WHERE id = ? AND organisation_id = ?", id, user.organisation_id);
    if (!p) break;
    path.unshift({ id: p.id, title: p.title });
    id = p.parent_id;
  }
  return path;
}
