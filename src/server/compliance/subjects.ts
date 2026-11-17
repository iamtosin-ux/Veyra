import crypto from "node:crypto";
import { all, get, now, parseJson, run, tx } from "../db";
import { HttpError, type User } from "../auth";
import { removeEvidence } from "../integrityReview";
import { readOriginal } from "../storage";
import { audit } from "./engine";

// Data-subject rights: find what the organisation holds about a person,
// export it for an access request, and erase it for an erasure request.
// A person reviews every result before anything is sent or removed; cases on
// legal hold are never erased. Audit entries record what was done, not the
// person's identifiers.

export interface SubjectRequest {
  id: string;
  kind: "access" | "erasure";
  subject_name: string;
  identifiers: string[];
  status: "open" | "completed" | "refused";
  received_at: string;
  due_at: string;
  notes: string | null;
  outcome: string | null;
  completed_at: string | null;
  created_at: string;
}

type Row = Omit<SubjectRequest, "identifiers"> & { identifiers: string };
const toRequest = (r: Row): SubjectRequest => ({ ...r, identifiers: parseJson<string[]>(r.identifiers, []) });

function requireAdmin(user: User) {
  if (user.role !== "admin") throw new HttpError(403, "Only an administrator can handle data-subject requests");
}

/** One calendar month from receipt: the usual UK GDPR response deadline. */
export function dueDate(receivedAt: string): string {
  const d = new Date(receivedAt);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

export function listRequests(user: User): SubjectRequest[] {
  requireAdmin(user);
  return all<Row>("SELECT * FROM subject_requests WHERE organisation_id = ? ORDER BY status = 'open' DESC, due_at", user.organisation_id).map(toRequest);
}

export function getRequest(user: User, id: string): SubjectRequest {
  requireAdmin(user);
  const r = get<Row>("SELECT * FROM subject_requests WHERE id = ? AND organisation_id = ?", id, user.organisation_id);
  if (!r) throw new HttpError(404, "Request not found");
  return toRequest(r);
}

export function createRequest(user: User, input: { kind: SubjectRequest["kind"]; subject_name: string; identifiers: string[]; received_at?: string | null; notes?: string | null }): SubjectRequest {
  requireAdmin(user);
  const identifiers = [...new Set([input.subject_name, ...input.identifiers].map((s) => s.trim()).filter((s) => s.length >= 3))];
  if (!identifiers.length) throw new HttpError(400, "Add the person's name or another identifier of at least 3 characters");
  const id = crypto.randomUUID();
  const received = input.received_at ? new Date(input.received_at).toISOString() : now();
  run(
    "INSERT INTO subject_requests (id, organisation_id, kind, subject_name, identifiers, received_at, due_at, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.organisation_id,
    input.kind,
    input.subject_name.trim(),
    JSON.stringify(identifiers),
    received,
    dueDate(received),
    input.notes?.trim() || null,
    user.id,
    now(),
  );
  record(user, null, `${input.kind === "access" ? "Access" : "Erasure"} request ${id.slice(0, 8)} logged.`);
  return getRequest(user, id);
}

export function closeRequest(user: User, id: string, status: "completed" | "refused", outcome: string): SubjectRequest {
  const r = getRequest(user, id);
  if (r.status !== "open") throw new HttpError(409, "This request is already closed");
  if (status === "refused" && !outcome.trim()) throw new HttpError(400, "Record why the request was refused");
  run("UPDATE subject_requests SET status = ?, outcome = ?, completed_at = ? WHERE id = ?", status, outcome.trim() || null, now(), id);
  record(user, null, `Request ${id.slice(0, 8)} ${status}.`);
  return getRequest(user, id);
}

function record(user: User, caseId: string | null, explanation: string, evidenceId: string | null = null) {
  audit({
    organisationId: user.organisation_id,
    caseId,
    evidenceId,
    user,
    actor: user.name,
    operation: "subject_request",
    purpose: null,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation,
    provider: null,
  });
}

// ---------------------------------------------------------------------------
// Search

export type MatchKind = "contributor" | "evidence_content" | "observation" | "finding" | "message" | "consent" | "invite";

export interface Match {
  kind: MatchKind;
  id: string;
  label: string;
  snippet: string;
  evidence_id: string | null;
}

export interface CaseMatches {
  case_id: string;
  case_title: string;
  legal_hold: boolean;
  matches: Match[];
}

const KIND_LABEL: Record<MatchKind, string> = {
  contributor: "Sent or named as contributor",
  evidence_content: "Mentioned in evidence",
  observation: "Observation",
  finding: "Finding",
  message: "Case conversation",
  consent: "Consent record",
  invite: "Upload invitation",
};
export { KIND_LABEL };

function snippet(text: string, terms: string[]): string | null {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - 60);
      return `${start ? "…" : ""}${text.slice(start, i + t.length + 60).replace(/\s+/g, " ").trim()}${i + t.length + 60 < text.length ? "…" : ""}`;
    }
  }
  return null;
}

function extractedText(content: string): string {
  const c = parseJson<{ text?: string; pages?: { text: string }[]; segments?: { text: string }[] }>(content, {});
  return [c.text ?? "", ...(c.pages ?? []).map((p) => p.text), ...(c.segments ?? []).map((s) => s.text)].join("\n");
}

/** Everything in the organisation that mentions any of the identifiers, grouped by case. */
export function searchSubject(user: User, identifiers: string[]): { cases: CaseMatches[]; unsearched: number } {
  requireAdmin(user);
  const terms = identifiers.map((t) => t.trim()).filter((t) => t.length >= 3);
  if (!terms.length) return { cases: [], unsearched: 0 };
  const org = user.organisation_id;
  const byCase = new Map<string, CaseMatches>();
  const add = (caseId: string, m: Match) => {
    let c = byCase.get(caseId);
    if (!c) {
      const k = get<{ title: string; legal_hold: number }>("SELECT title, legal_hold FROM cases WHERE id = ?", caseId)!;
      c = { case_id: caseId, case_title: k.title.replace(/^DEMO · /, ""), legal_hold: !!k.legal_hold, matches: [] };
      byCase.set(caseId, c);
    }
    if (!c.matches.some((x) => x.kind === m.kind && x.id === m.id)) c.matches.push(m);
  };

  const evidence = all<{ id: string; case_id: string; reference: string; original_filename: string; metadata: string; declared_source: string | null; processing_status: string }>(
    "SELECT e.id, e.case_id, e.reference, e.original_filename, e.metadata, e.declared_source, e.processing_status FROM evidence e JOIN cases c ON c.id = e.case_id WHERE c.organisation_id = ?",
    org,
  );
  for (const e of evidence) {
    const m = parseJson<{ contributor_name?: string; contributor_email?: string; stated_author?: string }>(e.metadata, {});
    const s = snippet([m.contributor_name, m.contributor_email, m.stated_author, e.declared_source, e.original_filename].filter(Boolean).join(" · "), terms);
    if (s) add(e.case_id, { kind: "contributor", id: e.id, label: `${e.reference} ${e.original_filename}`, snippet: s, evidence_id: e.id });
  }
  for (const x of all<{ evidence_id: string; case_id: string; reference: string; original_filename: string; content: string }>(
    `SELECT x.evidence_id, e.case_id, e.reference, e.original_filename, x.content FROM extractions x
       JOIN evidence e ON e.id = x.evidence_id JOIN cases c ON c.id = e.case_id
      WHERE c.organisation_id = ? AND x.kind IN ('document_text', 'transcript')`,
    org,
  )) {
    const s = snippet(extractedText(x.content), terms);
    if (s) add(x.case_id, { kind: "evidence_content", id: x.evidence_id, label: `${x.reference} ${x.original_filename}`, snippet: s, evidence_id: x.evidence_id });
  }
  for (const o of all<{ id: string; case_id: string; evidence_id: string; reference: string; description: string; quote: string | null }>(
    "SELECT o.id, o.case_id, o.evidence_id, o.reference, o.description, o.quote FROM observations o JOIN cases c ON c.id = o.case_id WHERE c.organisation_id = ? AND o.superseded = 0",
    org,
  )) {
    const s = snippet(`${o.description} ${o.quote ?? ""}`, terms);
    if (s) add(o.case_id, { kind: "observation", id: o.id, label: o.reference, snippet: s, evidence_id: o.evidence_id });
  }
  for (const f of all<{ id: string; case_id: string; reference: string; title: string; description: string }>(
    "SELECT f.id, f.case_id, f.reference, f.title, f.description FROM findings f JOIN cases c ON c.id = f.case_id WHERE c.organisation_id = ? AND f.superseded = 0",
    org,
  )) {
    const s = snippet(`${f.title}. ${f.description}`, terms);
    if (s) add(f.case_id, { kind: "finding", id: f.id, label: f.reference, snippet: s, evidence_id: null });
  }
  for (const msg of all<{ id: string; case_id: string; content: string; created_at: string }>(
    "SELECT m.id, m.case_id, m.content, m.created_at FROM case_messages m JOIN cases c ON c.id = m.case_id WHERE c.organisation_id = ?",
    org,
  )) {
    const s = snippet(parseJson<{ text?: string }>(msg.content, {}).text ?? "", terms);
    if (s) add(msg.case_id, { kind: "message", id: msg.id, label: `Message, ${msg.created_at.slice(0, 10)}`, snippet: s, evidence_id: null });
  }
  for (const c of all<{ id: string; case_id: string; subject_name: string; subject_contact: string | null; purpose: string }>("SELECT id, case_id, subject_name, subject_contact, purpose FROM consent_records WHERE organisation_id = ?", org)) {
    const s = snippet(`${c.subject_name} ${c.subject_contact ?? ""}`, terms);
    if (s) add(c.case_id, { kind: "consent", id: c.id, label: c.purpose.slice(0, 60), snippet: s, evidence_id: null });
  }
  for (const i of all<{ id: string; case_id: string; label: string; contact: string | null }>(
    "SELECT i.id, i.case_id, i.label, i.contact FROM upload_invites i JOIN cases c ON c.id = i.case_id WHERE c.organisation_id = ?",
    org,
  )) {
    const s = snippet(`${i.label} ${i.contact ?? ""}`, terms);
    if (s) add(i.case_id, { kind: "invite", id: i.id, label: i.label, snippet: s, evidence_id: null });
  }
  // Originals are encrypted and only searched through their extracted text.
  const unsearched = evidence.filter((e) => e.processing_status !== "processed").length;
  return { cases: [...byCase.values()], unsearched };
}

// ---------------------------------------------------------------------------
// Access: export

/** A ZIP for an access request: a readable report, the data as JSON, and files the person sent. */
export async function exportRequest(user: User, requestId: string): Promise<{ filename: string; bytes: Buffer }> {
  const r = getRequest(user, requestId);
  const found = searchSubject(user, r.identifiers);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const contributed = new Set(found.cases.flatMap((c) => c.matches.filter((m) => m.kind === "contributor" && m.evidence_id).map((m) => m.evidence_id!)));
  const lines = [
    `Data held about: ${r.subject_name}`,
    `Request received: ${r.received_at.slice(0, 10)} · respond by ${r.due_at.slice(0, 10)}`,
    `Exported: ${now().slice(0, 10)} by ${user.name}`,
    "",
    "Review before sending: this export can include other people's information, which may need to be removed or redacted.",
    found.unsearched ? `${found.unsearched} item(s) haven't been processed, so their contents weren't searched.` : "",
    "",
    ...found.cases.flatMap((c) => [`## ${c.case_title}`, ...c.matches.map((m) => `- ${KIND_LABEL[m.kind]}: ${m.label}\n  ${m.snippet}`), ""]),
  ];
  zip.file("report.txt", lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n"));
  zip.file("data.json", JSON.stringify({ request: { id: r.id, kind: r.kind, subject: r.subject_name, received_at: r.received_at, due_at: r.due_at }, cases: found.cases }, null, 2));
  for (const id of contributed) {
    const e = get<{ storage_reference: string; reference: string; original_filename: string }>("SELECT storage_reference, reference, original_filename FROM evidence WHERE id = ?", id);
    if (e) zip.file(`files/${e.reference}-${e.original_filename}`, readOriginal(e.storage_reference));
  }
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  record(user, null, `Exported data for request ${requestId.slice(0, 8)}: ${found.cases.length} case(s), ${contributed.size} file(s).`);
  return { filename: `subject-access-${r.received_at.slice(0, 10)}.zip`, bytes };
}

// ---------------------------------------------------------------------------
// Erasure

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Erase for an erasure request: delete the selected evidence items, and
 * replace the person's identifiers with "[erased]" across observations,
 * findings, conversations, extracted text, contributor details, consent
 * records and invitations. Cases on legal hold are skipped.
 */
export function eraseRequest(user: User, requestId: string, input: { evidenceIds: string[]; redact: boolean }) {
  const r = getRequest(user, requestId);
  if (r.kind !== "erasure") throw new HttpError(400, "Only an erasure request can erase data");
  if (r.status !== "open") throw new HttpError(409, "This request is already closed");
  const held = new Set(all<{ id: string }>("SELECT id FROM cases WHERE organisation_id = ? AND legal_hold = 1", user.organisation_id).map((c) => c.id));
  const skipped: string[] = [];
  let deleted = 0;
  for (const id of input.evidenceIds) {
    const e = get<{ case_id: string; reference: string }>("SELECT e.case_id, e.reference FROM evidence e JOIN cases c ON c.id = e.case_id WHERE e.id = ? AND c.organisation_id = ?", id, user.organisation_id);
    if (!e) continue;
    if (held.has(e.case_id)) {
      skipped.push(e.reference);
      continue;
    }
    removeEvidence(user, id);
    deleted++;
  }
  let redacted = 0;
  if (input.redact) {
    const re = new RegExp(r.identifiers.map(escape).join("|"), "gi");
    const scrub = (s: string | null) => (s ? s.replace(re, () => (redacted++, "[erased]")) : s);
    const scrubJson = (s: string) => s.replace(re, () => (redacted++, "[erased]"));
    const org = user.organisation_id;
    const notHeld = (caseId: string) => !held.has(caseId);
    tx(() => {
      for (const o of all<{ id: string; case_id: string; description: string; quote: string | null }>("SELECT o.id, o.case_id, o.description, o.quote FROM observations o JOIN cases c ON c.id = o.case_id WHERE c.organisation_id = ?", org).filter((o) => notHeld(o.case_id))) {
        const d = scrub(o.description)!;
        const q = scrub(o.quote);
        if (d !== o.description || q !== o.quote) run("UPDATE observations SET description = ?, quote = ? WHERE id = ?", d, q, o.id);
      }
      for (const f of all<{ id: string; case_id: string; title: string; description: string }>("SELECT f.id, f.case_id, f.title, f.description FROM findings f JOIN cases c ON c.id = f.case_id WHERE c.organisation_id = ?", org).filter((f) => notHeld(f.case_id))) {
        const t = scrub(f.title)!;
        const d = scrub(f.description)!;
        if (t !== f.title || d !== f.description) run("UPDATE findings SET title = ?, description = ? WHERE id = ?", t, d, f.id);
      }
      for (const m of all<{ id: string; case_id: string; content: string }>("SELECT m.id, m.case_id, m.content FROM case_messages m JOIN cases c ON c.id = m.case_id WHERE c.organisation_id = ?", org).filter((m) => notHeld(m.case_id))) {
        const c = scrubJson(m.content);
        if (c !== m.content) run("UPDATE case_messages SET content = ? WHERE id = ?", c, m.id);
      }
      for (const x of all<{ id: string; case_id: string; content: string }>(
        "SELECT x.id, e.case_id, x.content FROM extractions x JOIN evidence e ON e.id = x.evidence_id JOIN cases c ON c.id = e.case_id WHERE c.organisation_id = ?",
        org,
      ).filter((x) => notHeld(x.case_id))) {
        const c = scrubJson(x.content);
        if (c !== x.content) run("UPDATE extractions SET content = ? WHERE id = ?", c, x.id);
      }
      for (const e of all<{ id: string; case_id: string; metadata: string; declared_source: string | null }>("SELECT e.id, e.case_id, e.metadata, e.declared_source FROM evidence e JOIN cases c ON c.id = e.case_id WHERE c.organisation_id = ?", org).filter((e) => notHeld(e.case_id))) {
        const meta = scrubJson(e.metadata);
        const src = scrub(e.declared_source);
        if (meta !== e.metadata || src !== e.declared_source) run("UPDATE evidence SET metadata = ?, declared_source = ? WHERE id = ?", meta, src, e.id);
      }
      for (const c of all<{ id: string; case_id: string; subject_name: string; subject_contact: string | null }>("SELECT id, case_id, subject_name, subject_contact FROM consent_records WHERE organisation_id = ?", org).filter((c) => notHeld(c.case_id))) {
        const n = scrub(c.subject_name)!;
        const k = scrub(c.subject_contact);
        if (n !== c.subject_name || k !== c.subject_contact) run("UPDATE consent_records SET subject_name = ?, subject_contact = ? WHERE id = ?", n, k, c.id);
      }
      for (const i of all<{ id: string; case_id: string; label: string; contact: string | null }>("SELECT i.id, i.case_id, i.label, i.contact FROM upload_invites i JOIN cases c ON c.id = i.case_id WHERE c.organisation_id = ?", org).filter((i) => notHeld(i.case_id))) {
        const l = scrub(i.label)!;
        const k = scrub(i.contact);
        if (l !== i.label || k !== i.contact) run("UPDATE upload_invites SET label = ?, contact = ? WHERE id = ?", l, k, i.id);
      }
    });
  }
  record(user, null, `Erasure for request ${requestId.slice(0, 8)}: ${deleted} item(s) deleted, ${redacted} mention(s) erased${skipped.length ? `, ${skipped.length} item(s) kept under legal hold` : ""}.`);
  return { deleted, redacted, skipped };
}
