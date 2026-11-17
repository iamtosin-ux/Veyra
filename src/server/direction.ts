import crypto from "node:crypto";
import { all, get, now, run } from "./db";
import { HttpError, type User } from "./auth";
import { getCaseForUser, touchCase } from "./cases";
import { postMessage } from "./assistant/assistant";
import { caseType, typesFor, type CaseType } from "@/lib/caseTypes";

/**
 * Case direction: whether the case is being built as the right kind of case.
 * Veyra checks every case type for the case's sector against what the evidence
 * shows. When another type fits clearly better, it offers a handoff: the case
 * keeps everything (evidence, findings, chronology, conversation) and is rebuilt
 * against the new type's checklist once the user commits.
 */

export interface Signal {
  ref: string;
  text: string;
  evidence_id: string | null;
}

export interface ChecklistResult {
  key: string;
  label: string;
  have: boolean;
  sources: Signal[];
}

export interface TypeAssessment {
  key: string;
  label: string;
  protocol: string;
  signals: Signal[];
  checklist: ChecklistResult[];
  coverage: number;
}

interface Item {
  ref: string;
  text: string;
  evidence_id: string | null;
  evidence_type: string | null;
}

// Words match from the start of a word, so "lock" doesn't match "clock" but
// "injur" matches "injury" and "injured".
const patterns = new Map<string, RegExp>();
const pattern = (w: string) => {
  let re = patterns.get(w);
  if (!re) patterns.set(w, (re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")));
  return re;
};
const hits = (text: string, words: string[]) => words.filter((w) => pattern(w).test(text)).length;
const has = (text: string, words: string[]) => hits(text, words) > 0;

/** Pure: how well the case's material fits one case type. */
export function assessType(t: CaseType, items: Item[], evidenceTypes: string[]): TypeAssessment {
  // Strongest first: items matching more of the type's signal words.
  const signals = items
    .map((i) => ({ i, n: hits(i.text, t.signals) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ i: { ref, text, evidence_id } }) => ({ ref, text, evidence_id }));
  const checklist = t.checklist.map((c) => {
    const byWords = c.words ? items.filter((i) => has(i.text, c.words!)) : [];
    const byType = c.types ? items.filter((i) => i.evidence_type && c.types!.includes(i.evidence_type)) : [];
    const sources = [...byWords, ...byType.filter((i) => !byWords.includes(i))].slice(0, 3).map(({ ref, text, evidence_id }) => ({ ref, text, evidence_id }));
    const typed = !!c.types?.some((ty) => evidenceTypes.includes(ty));
    return { key: c.key, label: c.label, have: sources.length > 0 || (typed && !c.words), sources };
  });
  return { key: t.key, label: t.label, protocol: t.protocol, signals, checklist, coverage: checklist.filter((c) => c.have).length / Math.max(1, checklist.length) };
}

/**
 * Pure: whether to offer another type. With no type set, the best-supported one.
 * With a type set, another is offered when it is clearly better supported, or
 * when it has a substantial strand of its own (at least half as many signals)
 * and at least one finding fits it but not the current type.
 */
export function pickSuggestion(current: TypeAssessment | null, others: TypeAssessment[]): TypeAssessment | null {
  const best = [...others].sort((a, b) => b.signals.length - a.signals.length || b.coverage - a.coverage)[0];
  if (!best || best.signals.length < 3 || best.coverage < 0.5) return null;
  if (!current) return best;
  const onlyOther = best.signals.filter((s) => s.ref.startsWith("FND-") && !current.signals.some((c) => c.ref === s.ref));
  const clearlyBetter = best.signals.length >= current.signals.length + 2 && best.coverage >= current.coverage;
  const closeWithOwnFinding = best.signals.length >= Math.max(3, Math.ceil(current.signals.length / 2)) && onlyOther.length > 0;
  if (!clearlyBetter && !closeWithOwnFinding) return null;
  // Reasons stay strongest first; a weak finding that merely mentions a signal word shouldn't lead.
  return best;
}

function caseItems(caseId: string): { items: Item[]; evidenceTypes: string[] } {
  const obs = all<{ reference: string; description: string; evidence_id: string; evidence_type: string }>(
    `SELECT o.reference, o.description, o.evidence_id, e.evidence_type FROM observations o JOIN evidence e ON e.id = o.evidence_id
      WHERE o.case_id = ? AND e.compliance_status IS NOT 'RESTRICTED'`,
    caseId,
  );
  const findings = all<{ reference: string; title: string; description: string }>(
    "SELECT reference, title, description FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL AND review_status != 'rejected'",
    caseId,
  );
  const evidenceTypes = all<{ evidence_type: string }>("SELECT DISTINCT evidence_type FROM evidence WHERE case_id = ?", caseId).map((r) => r.evidence_type);
  return {
    items: [
      ...findings.map((f) => ({ ref: f.reference, text: `${f.title}. ${f.description}`, evidence_id: null, evidence_type: null })),
      ...obs.map((o) => ({ ref: o.reference, text: o.description, evidence_id: o.evidence_id, evidence_type: o.evidence_type })),
    ],
    evidenceTypes,
  };
}

export function caseDirection(user: User, caseId: string) {
  const c = getCaseForUser(user, caseId, "case");
  const types = typesFor(c.industry);
  const { items, evidenceTypes } = caseItems(caseId);
  const assessed = types.map((t) => assessType(t, items, evidenceTypes));
  const current = assessed.find((a) => a.key === c.case_type) ?? null;
  // Not offered: anything dismissed for the current type, and any type the case was deliberately handed off from.
  const declined = new Set([
    ...all<{ to_type: string }>("SELECT to_type FROM case_handoffs WHERE case_id = ? AND from_type IS ? AND status = 'dismissed'", caseId, c.case_type ?? null).map((r) => r.to_type),
    ...all<{ from_type: string }>("SELECT from_type FROM case_handoffs WHERE case_id = ? AND status = 'committed' AND from_type IS NOT NULL", caseId).map((r) => r.from_type),
  ]);
  const suggestion = pickSuggestion(current, assessed.filter((a) => a.key !== c.case_type && !declined.has(a.key)));
  return {
    types: types.map((t) => ({ key: t.key, label: t.label })),
    /** Every type for the case's sector, for choosing one by hand (/handoff). */
    assessments: assessed,
    current,
    suggestion,
    carries: {
      evidence: Number(get<{ n: number }>("SELECT COUNT(*) n FROM evidence WHERE case_id = ?", caseId)?.n ?? 0),
      findings: Number(get<{ n: number }>("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0 AND archived_at IS NULL", caseId)?.n ?? 0),
      events: Number(get<{ n: number }>("SELECT COUNT(*) n FROM chronology_events WHERE case_id = ? AND superseded = 0", caseId)?.n ?? 0),
      messages: Number(get<{ n: number }>("SELECT COUNT(*) n FROM case_messages WHERE case_id = ?", caseId)?.n ?? 0),
    },
  };
}

/** The case's evidence against one type's checklist, whatever the case's sector. Null for an unknown type. */
export function assessCaseAs(user: User, caseId: string, key: string): TypeAssessment | null {
  getCaseForUser(user, caseId, "case");
  const t = caseType(key);
  if (!t) return null;
  const { items, evidenceTypes } = caseItems(caseId);
  return assessType(t, items, evidenceTypes);
}

/** Not now: the same suggestion isn't offered again while the case keeps its current type. */
export function dismissHandoff(user: User, caseId: string, to: string) {
  const c = getCaseForUser(user, caseId, "case");
  if (!caseType(to)) throw new HttpError(400, "Unknown case type");
  run(
    "INSERT INTO case_handoffs (id, case_id, from_type, to_type, status, decided_by, decided_at, created_at) VALUES (?, ?, ?, ?, 'dismissed', ?, ?, ?)",
    crypto.randomUUID(), caseId, c.case_type ?? null, to, user.id, now(), now(),
  );
}

/**
 * Change the case's type, keeping everything it holds. Posts a handoff note to
 * the conversation recording what carried over and what the new type still needs.
 */
export function setCaseType(user: User, caseId: string, to: string | null, opts: { handoff?: boolean } = {}) {
  const c = getCaseForUser(user, caseId, "case");
  const next = to ? caseType(to) : null;
  if (to && !next) throw new HttpError(400, "Unknown case type");
  if ((c.case_type ?? null) === to) return;
  run("UPDATE cases SET case_type = ? WHERE id = ?", to, caseId);
  touchCase(caseId);
  if (!opts.handoff || !next) return;

  const from = caseType(c.case_type);
  const d = caseDirection(user, caseId);
  const now_ = d.current;
  const missing = now_?.checklist.filter((i) => !i.have).map((i) => i.label) ?? [];
  run(
    "INSERT INTO case_handoffs (id, case_id, from_type, to_type, status, decided_by, decided_at, created_at) VALUES (?, ?, ?, ?, 'committed', ?, ?, ?)",
    crypto.randomUUID(), caseId, c.case_type ?? null, to, user.id, now(), now(),
  );
  postMessage(
    caseId,
    "assistant",
    {
      text:
        `Handed off from ${from?.label ?? "an untyped case"} to **${next.label}**, built against the ${next.protocol}.\n\n` +
        `Carried over: ${d.carries.evidence} evidence item(s), ${d.carries.findings} finding(s), ${d.carries.events} chronology event(s) and this conversation. Nothing was removed.\n\n` +
        (missing.length ? `Still needed for this kind of case:\n${missing.map((m) => `- ${m}`).join("\n")}\n\nRe-run Analyse so the findings are drawn up for the new direction.` : "The evidence already covers each item on the checklist. Re-run Analyse so the findings are drawn up for the new direction."),
      actions: [{ kind: "analyse", label: "Analyse for the new direction" }],
    },
    user.id,
  );
}
