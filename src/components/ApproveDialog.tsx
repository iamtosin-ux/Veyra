"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "./Icon";

export interface ApprovalStatus {
  reviewed: number;
  unreviewed: number;
  reviewRequests: number;
  webPending: number;
  processing: number;
  lastApproval: { id: string; version: number; approved_at: string; approved_by_name: string | null } | null;
}

/** Sign off the case pack. Only accepted or corrected findings go into the approved version. */
export function ApproveDialog({ caseId, onClose, onApproved }: { caseId: string; onClose: () => void; onApproved: (packId: string) => void }) {
  const { data } = useApi<{ status: ApprovalStatus }>(`/api/cases/${caseId}/pack/approve`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = data?.status;
  const open = st
    ? ([
        [st.unreviewed, `${st.unreviewed} unreviewed finding${st.unreviewed === 1 ? "" : "s"} will be left out`],
        [st.reviewRequests, `${st.reviewRequests} section review request${st.reviewRequests === 1 ? " is" : "s are"} still open`],
        [st.webPending, `${st.webPending} web source${st.webPending === 1 ? " is" : "s are"} awaiting approval`],
        [st.processing, `${st.processing} file${st.processing === 1 ? " is" : "s are"} still processing`],
      ].filter(([n]) => n) as [number, string][])
    : [];

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ approval: { id: string } }>(`/api/cases/${caseId}/pack/approve`, { method: "POST" });
      onApproved(r.approval.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Approve case file">
      <div className="w-full max-w-[440px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-start justify-between">
          <p className="text-[16px] font-semibold">Approve case file</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        {!st ? (
          <p className="mt-3 text-[13px] text-muted">Loading…</p>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-muted">
              Saves a new version with the {st.reviewed} finding{st.reviewed === 1 ? "" : "s"} you&apos;ve accepted or corrected, signed off by you.
            </p>
            {st.lastApproval && (
              <p className="mt-2 text-[12px] text-faint">
                Last approved: version {st.lastApproval.version}
                {st.lastApproval.approved_by_name ? ` by ${st.lastApproval.approved_by_name}` : ""}
              </p>
            )}
            {open.length > 0 && (
              <ul className="mt-3 space-y-1.5 rounded-lg bg-draft-soft px-3 py-2.5 text-[12px] text-draft">
                {open.map(([, t]) => (
                  <li key={t} className="flex gap-1.5">
                    <Icon name="alert" size={13} className="mt-px shrink-0" /> {t}
                  </li>
                ))}
              </ul>
            )}
            {st.reviewed === 0 && <p className="mt-3 text-[12px] text-danger">Review at least one finding before approving.</p>}
            {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle">Cancel</button>
              <button disabled={busy || st.reviewed === 0} onClick={() => void approve()} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-40">
                {busy ? "Approving…" : open.length ? "Approve anyway" : "Approve"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
