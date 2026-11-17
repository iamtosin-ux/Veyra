"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COMPLIANCE_LABEL,
  INTEGRITY_STATUS_LABEL,
  OPERATION_LABEL,
  VERIFICATION_LABEL,
  type Category,
  type ComplianceStatus,
  type IntegrityStatus,
  type Operation,
  type VerificationStatus,
} from "@/lib/compliance";
import { toast } from "@/lib/toast";
import type { EvidenceItem } from "./case/types";
import { Icon, type IconName } from "./Icon";
import { ConsentRecords } from "./ConsentRecords";
import { ProgressRing, integrityLabel, needsAttention, type IntegrityReport, type IntegrityReview } from "./Integrity";
import { cx } from "./ui";
import { Menu, type MenuItem } from "./Menu";

const STATUS: Record<"ok" | "issue" | "not_checked", { icon: IconName; cls: string; label: string }> = {
  ok: { icon: "checkFill", cls: "text-ok", label: "Passed" },
  issue: { icon: "alert", cls: "text-[#d97706]", label: "Issue found" },
  not_checked: { icon: "info", cls: "text-faint", label: "Not checked" },
};

interface ComplianceInfo {
  evidence: { reference: string; filename: string; type: string; uploaded_at: string; declared_source: string | null; hash: string; processing_status: string };
  compliance: {
    status: ComplianceStatus;
    decision: "ALLOW" | "REVIEW_REQUIRED" | "BLOCK";
    reasons: { code: string; text: string }[];
    category: Category;
    category_source: string;
    category_confirmed: boolean;
    human_approval: { by: string; at: string; reason: string } | null;
    can_approve: boolean;
  };
  integrity: { status: IntegrityStatus; checked_at: string | null };
  verification: { status: VerificationStatus };
  policy: { version: number } | null;
  analysed_under: { policy_version: number | null; at: string | null; model: string | null } | null;
  reassess: boolean;
  history: { id: string; actor: string; operation: string; decision: string; explanation: string; provider: string | null; policy_version: number | null; created_at: string }[];
}

const TONE = { ok: "bg-ok-soft text-ok", warn: "bg-[#fdf3e7] text-[#b45309]", bad: "bg-danger-soft text-danger", neutral: "bg-subtle text-muted" } as const;
const complianceTone = (s: ComplianceStatus) => (s === "APPROVED" ? TONE.ok : s === "BLOCKED" ? TONE.bad : s === "RESTRICTED" ? TONE.bad : TONE.warn);
const integrityTone = (s: IntegrityStatus) => (s === "NO_INDICATORS_DETECTED" || s === "PROVENANCE_VERIFIED" ? TONE.ok : s === "NOT_CHECKED" ? TONE.neutral : s === "HUMAN_REVIEW_REQUIRED" ? TONE.bad : TONE.warn);
const verificationTone = (s: VerificationStatus) => (s === "VERIFIED" ? TONE.ok : s === "DISCREPANCY_FOUND" ? TONE.bad : TONE.neutral);
const OP_LABEL: Record<string, string> = {
  ...OPERATION_LABEL,
  intake: "Upload",
  human_approval: "Approved for analysis",
  restriction: "Restriction",
  classification: "Evidence type",
  policy_change: "Policy change",
  file_access: "File opened or shared",
  deletion: "Deleted",
  retention: "Retention",
  consent: "Consent",
  subject_request: "Data-subject request",
};

function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cx("inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[12px] font-medium", tone)}>{children}</span>;
}

/** One property row, Linear-style: its name, then its value. With items, only the value is a button that opens a menu. */
function Property({ label, items, width = 220, dropdown, children }: { label: string; items?: MenuItem[]; width?: number; dropdown?: boolean; children: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-2.5">
      <span className="w-[100px] shrink-0 text-[13px] text-muted">{label}</span>
      {items?.length ? (
        <Menu
          align="left"
          width={width}
          items={items}
          trigger={({ toggle, ref, open }) => (
            <button
              ref={ref}
              onClick={toggle}
              aria-expanded={open}
              aria-label={`${label} options`}
              className={cx("-ml-1.5 flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] hover:bg-hover", open && "bg-hover")}
            >
              {children}
              {!dropdown && <Icon name="chevron" size={14} className="shrink-0 rotate-90 text-faint" />}
            </button>
          )}
        />
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 text-[13px]">{children}</span>
      )}
    </div>
  );
}

/**
 * Everything about one evidence item, kept in separate parts that never stand in
 * for each other: whether it may be processed (compliance), whether the file
 * shows signs of alteration (integrity), whether it was checked with an issuing
 * source (verification), plus its details and processing history.
 */
export function EvidenceDrawer({
  item,
  report,
  review,
  onClose,
  onChanged,
  embedded,
}: {
  item: EvidenceItem;
  report?: IntegrityReport | null;
  review?: IntegrityReview | null;
  onClose: () => void;
  onChanged: () => void;
  /** Inside another window's side panel: no floating shell, header or Escape handling of its own. */
  embedded?: boolean;
}) {
  const m = item.metadata as { upload_source?: string; contributor_name?: string | null; contributor_email?: string | null };
  const contributor = m.upload_source === "invite" ? (m.contributor_name ?? "the contributor") : null;
  const [label, tone] = report ? integrityLabel(report) : ["Not checked yet", "neutral" as const];
  const issues = report ? report.indicators.filter((i) => i.level !== "info") : [];
  const flagged = needsAttention(report, review);
  const info = useApi<ComplianceInfo>(`/api/evidence/${item.id}/compliance`);
  const c = info.data?.compliance;
  const [approveReason, setApproveReason] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const complianceAct = async (json: Record<string, unknown>, done: string) => {
    const ok = await act(() => api(`/api/evidence/${item.id}/compliance`, { method: "POST", json }), done);
    if (ok) void info.reload();
    return ok;
  };
  const [mode, setMode] = useState<"idle" | "confirmRemove" | "ask">("idle");
  const [note, setNote] = useState("");
  const [draftedBy, setDraftedBy] = useState<"ai" | "template" | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, embedded]);

  const act = async (fn: () => Promise<unknown>, done: string, tone?: "danger") => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(done, { tone });
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startAsk = async () => {
    setMode("ask");
    if (note) return;
    setDrafting(true);
    try {
      const r = await api<{ message: string; drafted_by: "ai" | "template" }>(`/api/evidence/${item.id}/integrity-review/draft`, { method: "POST" });
      setNote(r.message);
      setDraftedBy(r.drafted_by);
    } catch {
      setNote("");
    }
    setDrafting(false);
  };

  return (
    <aside
      aria-label={`Details of ${item.original_filename}`}
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col"
          : "animate-pop fixed bottom-3 right-3 top-[60px] z-40 flex w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[20px] border border-line bg-panel shadow-[var(--shadow-dialog)]"
      }
      style={embedded ? undefined : { transformOrigin: "right center" }}
    >
      {!embedded && (
        <header className="flex items-start gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{item.original_filename}</p>
            <p className="text-[12.5px] text-muted">{info.data?.evidence.reference ?? item.reference}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </header>
      )}

      <div className="scroll-panel min-h-0 flex-1 space-y-6 px-5 py-5">
        {/* What the file is and where it came from. */}
        <dl className="space-y-1.5 text-[12.5px]">
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-muted">From</dt><dd className="min-w-0">{contributor ? `${contributor}${m.contributor_email ? ` (${m.contributor_email})` : ""}` : "Uploaded by your team"}</dd></div>
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-muted">Declared source</dt><dd className="min-w-0">{info.data?.evidence.declared_source ?? "Not given"}</dd></div>
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-muted">Uploaded</dt><dd>{formatDateTime(item.uploaded_at)}</dd></div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-muted">SHA-256</dt>
            <dd className="min-w-0 truncate tabular-nums text-[11.5px]" title={`${info.data?.evidence.hash ?? ""}\nShows whether the stored file has changed since upload, not that it was authentic before.`}>{info.data?.evidence.hash ?? ""}</dd>
          </div>
          {report && <div className="flex gap-3"><dt className="w-28 shrink-0 text-muted">Checked</dt><dd>{formatDateTime(report.checked_at)}</dd></div>}
        </dl>

        {info.data && c && (
          <section>
            <p className="mb-1 text-[12px] font-medium text-muted">Properties</p>
            <Property
              label="Compliance"
              items={c.can_approve ? [{ label: "Approve for analysis", icon: "check" as const, onSelect: () => setApproveReason("") }] : undefined}
            >
              <Tag tone={complianceTone(c.status)}>{COMPLIANCE_LABEL[c.status]}</Tag>
            </Property>
            {/* A state from the scan, not something a reviewer sets. */}
            <Property label="Integrity">
              <Tag tone={integrityTone(info.data.integrity.status)}>{INTEGRITY_STATUS_LABEL[info.data.integrity.status]}</Tag>
            </Property>
            <Property
              label="Verification"
              items={[
                {
                  label: "Request verification",
                  icon: "refresh",
                  onSelect: () =>
                    void (async () => {
                      setBusy(true);
                      try {
                        const r = await api<{ status: VerificationStatus; explanation: string }>(`/api/evidence/${item.id}/compliance`, { method: "POST", json: { action: "verify" } });
                        setVerifyNote(r.explanation);
                        toast("Verification not permitted", { tone: "danger" });
                        void info.reload();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Could not request verification");
                      }
                      setBusy(false);
                    })(),
                },
              ]}
            >
              <Tag tone={verificationTone(info.data.verification.status)}>{VERIFICATION_LABEL[info.data.verification.status]}</Tag>
            </Property>
            <Property
              label="Type"
              items={CATEGORIES.map((k) => ({
                label: CATEGORY_LABEL[k],
                checked: k === c.category,
                onSelect: () => void complianceAct({ action: "category", category: k }, "Evidence type updated"),
              }))}
              width={260}
              dropdown
            >
              <span className="truncate">{CATEGORY_LABEL[c.category]}</span>
              {!c.category_confirmed && <Tag tone={TONE.warn}>Unconfirmed</Tag>}
              <Icon name="chevron" size={14} className="shrink-0 rotate-90 text-faint" />
            </Property>

            {c.status !== "APPROVED" && (
              <ul className="mt-2 space-y-1.5">
                {c.reasons.map((r) => (
                  <li key={r.code} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#8a4a10]">
                    <Icon name="alert" size={13} className="mt-1 shrink-0" />
                    <span>{r.text}</span>
                  </li>
                ))}
                {c.status === "RESTRICTED" && <li className="text-[12.5px] text-[#8a4a10]">Restricted. Nothing runs on it until the restriction is lifted.</li>}
              </ul>
            )}
            {verifyNote && <p className="mt-2 text-[12.5px] text-muted">{verifyNote}</p>}
            {c.human_approval && (
              <p className="mt-2 text-[12.5px] text-muted">
                Approved by {c.human_approval.by} on {formatDateTime(c.human_approval.at)}: {c.human_approval.reason}
              </p>
            )}
            {approveReason !== null && (
              <div className="mt-3 space-y-2">
                <textarea
                  autoFocus
                  rows={2}
                  value={approveReason}
                  onChange={(e) => setApproveReason(e.target.value)}
                  placeholder="Why may this be analysed?"
                  className="w-full resize-none rounded-xl bg-subtle px-3 py-2 text-[13px] outline-none focus-visible:outline-none focus:ring-1 focus:ring-line-strong"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setApproveReason(null)} className="h-8 rounded-lg px-3 text-[13px] hover:bg-hover">Cancel</button>
                  <button
                    disabled={!approveReason.trim() || busy}
                    onClick={() => void complianceAct({ action: "approve", reason: approveReason }, "Approved for analysis").then((ok) => ok && setApproveReason(null))}
                    className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}
            {info.data.reassess && (
              <p className="mt-3 rounded-xl bg-[#fdf3e7] px-3 py-2 text-[12.5px] text-[#8a4a10]">
                Analysed under policy v{info.data.analysed_under?.policy_version}. The current policy is v{info.data.policy?.version}; re-run the analysis to reassess.
              </p>
            )}
          </section>
        )}

        {info.data && item.case_id && (
          <ConsentRecords
            caseId={item.case_id}
            item={item}
            onChanged={() => {
              void info.reload();
              onChanged();
            }}
          />
        )}

        {review && (
          <p className="rounded-xl bg-subtle px-3 py-2 text-[12.5px] text-muted">
            {review.decision === "kept" ? "Kept" : "Replacement requested"}
            {review.decided_by_name ? ` by ${review.decided_by_name}` : ""} · {formatDateTime(review.created_at)}
          </p>
        )}

        {issues.length > 0 && (
          <section>
            <p className="text-[12px] font-medium text-muted">What we found · <span className={tone === "danger" ? "text-danger" : "text-[#b45309]"}>{label}</span></p>
            <ul className="mt-2 space-y-2">
              {issues.map((i) => (
                <li key={i.code} className="rounded-xl bg-subtle px-3.5 py-3">
                  <p className="text-[13px] font-medium">{i.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{i.detail}</p>
                </li>
              ))}
            </ul>
            {flagged && (
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => void act(() => api(`/api/evidence/${item.id}/integrity-review`, { method: "POST", json: { action: "keep" } }), `Kept ${item.original_filename}`)}
                  className="h-8 rounded-lg border border-line-strong px-3 text-[12.5px] font-medium hover:bg-subtle disabled:opacity-50"
                >
                  Keep as it is
                </button>
                {contributor && (
                  <button onClick={() => void startAsk()} className="h-8 rounded-lg border border-line-strong px-3 text-[12.5px] font-medium hover:bg-subtle">
                    Ask for another
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {report?.checks && (
          <section>
            <p className="text-[12px] font-medium text-muted">Checks</p>
            {/* Each check as a step on a timeline. */}
            <ol className="relative mt-3 space-y-4">
              <span aria-hidden className="absolute bottom-2 left-[9px] top-2 w-px bg-line" />
              {report.checks.map((ch) => (
                <li key={ch.name} className="relative flex items-start gap-3">
                  <span className="relative z-10 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full bg-panel">
                    <Icon name={STATUS[ch.status].icon} size={17} className={STATUS[ch.status].cls} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {ch.name} <span className="font-normal text-faint">· {STATUS[ch.status].label}</span>
                    </p>
                    <p className="text-[12.5px] leading-relaxed text-muted">{ch.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {info.data && info.data.history.length > 0 && (
          <section>
            <p className="text-[12px] font-medium text-muted">Processing history</p>
            <ol className="mt-2 space-y-2.5">
              {info.data.history.slice(0, 12).map((h) => (
                <li key={h.id} className="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-2.5 text-[12.5px]">
                  {/* One fixed column for the tag, so every entry's text starts in the same place. */}
                  <span className={cx("mt-px justify-self-start rounded-md px-1.5 py-px text-[11px] font-medium", h.decision === "ALLOW" ? TONE.ok : h.decision === "BLOCK" ? TONE.bad : h.decision === "REVIEW_REQUIRED" ? TONE.warn : TONE.neutral)}>
                    {h.decision === "RECORDED" ? "Note" : h.decision === "REVIEW_REQUIRED" ? "Review" : h.decision === "ALLOW" ? "Allowed" : "Blocked"}
                  </span>
                  <span className="min-w-0">
                    <span className="block leading-snug">{OP_LABEL[h.operation as Operation] ?? h.operation}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-1 leading-snug text-faint">
                      <span className="whitespace-nowrap">{h.actor}</span>
                      <span className="whitespace-nowrap">· {formatDateTime(h.created_at)}</span>
                      {h.policy_version ? <span className="whitespace-nowrap">· Policy v{h.policy_version}</span> : null}
                      {h.provider ? <span className="whitespace-nowrap">· {h.provider}</span> : null}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {mode === "ask" && (
          <section>
            <label htmlFor="replacement-note" className="text-[12px] font-medium text-muted">
              Note to {contributor}
            </label>
            {drafting ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-subtle px-3.5 py-3 text-[13px] text-muted">
                <ProgressRing size={14} /> Drafting a note…
              </div>
            ) : (
              <textarea
                id="replacement-note"
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={9}
                className="mt-2 w-full resize-y rounded-xl bg-subtle px-3.5 py-3 text-[13px] leading-relaxed outline-none focus-visible:outline-none focus:ring-1 focus:ring-line-strong"
              />
            )}
            {draftedBy === "ai" && !drafting && <p className="mt-1 text-[11.5px] text-faint">Drafted by Veyra. Edit it before sending.</p>}
            {sentLink && (
              <div className="mt-3 rounded-xl bg-subtle p-3 text-[12.5px]">
                <p className="font-medium">Request created</p>
                <p className="mt-0.5 text-muted">Email isn&apos;t connected yet, so send {contributor} this link with your note.</p>
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-subtle p-1 pl-2.5">
                  <span className="min-w-0 flex-1 truncate tabular-nums text-[11.5px] text-muted">{sentLink}</span>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(`${note}\n\n${sentLink}`)
                        .then(() => toast("Note and link copied"))
                        .catch(() => toast("Couldn't copy. Select the link instead.", { tone: "danger" }))
                    }
                    className="h-7 shrink-0 rounded-lg bg-primary px-2.5 text-[12px] font-medium text-white hover:bg-primary-hover"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
      </div>

      <footer className="p-3">
        {mode === "confirmRemove" ? (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 px-1 text-[12.5px] text-muted">Remove the file and its analysis from this case?</p>
            <button onClick={() => setMode("idle")} className="h-9 rounded-lg px-3 text-[13px] font-medium hover:bg-hover">
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={() => void act(() => api(`/api/evidence/${item.id}`, { method: "DELETE" }), `Removed ${item.original_filename}`, "danger").then((ok) => ok && onClose())}
              className="h-9 rounded-xl bg-danger px-3 text-[13px] font-medium text-white disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : mode === "ask" && !sentLink ? (
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setMode("idle")} className="h-9 rounded-lg px-3 text-[13px] font-medium hover:bg-hover">
              Cancel
            </button>
            <button
              disabled={busy || drafting || !note.trim()}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const r = await api<{ token: string }>(`/api/evidence/${item.id}/integrity-review`, { method: "POST", json: { action: "request", message: note } });
                    setSentLink(`${window.location.origin}/upload/${r.token}`);
                    toast(`Replacement requested from ${contributor}`);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not create the request");
                  }
                  setBusy(false);
                })()
              }
              className="h-9 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Request replacement
            </button>
          </div>
        ) : mode === "ask" ? (
          <div className="flex justify-end">
            <button onClick={() => setMode("idle")} className="h-9 rounded-lg px-3.5 text-[13px] font-medium hover:bg-hover">
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {c?.status === "RESTRICTED" ? (
              <button disabled={busy} onClick={() => void complianceAct({ action: "unrestrict" }, "Restriction lifted")} className="h-9 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle disabled:opacity-50">
                Lift restriction
              </button>
            ) : (
              <button disabled={busy || !c} onClick={() => void complianceAct({ action: "restrict", reason: "" }, "Evidence restricted")} className="h-9 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle disabled:opacity-50">
                Restrict
              </button>
            )}
            <button onClick={() => setMode("confirmRemove")} className="h-9 rounded-lg border border-danger/30 px-3 text-[13px] font-medium text-danger hover:bg-danger-soft">
              Remove
            </button>
          </div>
        )}
      </footer>
    </aside>
  );
}

/** The details panel for one item inside a viewer window: loads its integrity report and any reviewer decision. */
export function EvidenceDetailsPanel({ item, onChanged }: { item: EvidenceItem; onChanged?: () => void }) {
  const integrity = useApi<{ reports: Record<string, IntegrityReport>; reviews: Record<string, IntegrityReview> }>(item.case_id ? `/api/cases/${item.case_id}/integrity` : null);
  return (
    <EvidenceDrawer
      embedded
      item={item}
      report={integrity.data?.reports[item.id]}
      review={integrity.data?.reviews[item.id]}
      onClose={() => {}}
      onChanged={() => {
        void integrity.reload();
        onChanged?.();
      }}
    />
  );
}
