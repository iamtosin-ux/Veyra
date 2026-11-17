"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

/** Deleting moves the case to the trash, where it can be restored for 30 days. */
export function DeleteCaseDialog({ caseId, title, onClose, onDeleted }: { caseId: string; reference?: string; title: string; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}`, { method: "DELETE" });
      toast(`Moved “${title}” to the trash`, {
        tone: "danger",
        action: { label: "Undo", onClick: () => void api(`/api/cases/${caseId}/restore`, { method: "POST" }).then(() => toast("Case restored")) },
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the case");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()} role="dialog" aria-modal="true" aria-label="Delete case">
      <div className="w-full max-w-[400px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <p className="text-[16px] font-semibold">Delete “{title}”?</p>
        <p className="mt-1.5 text-[13px] text-muted">It moves to the trash in Settings, where you can restore it for 30 days.</p>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button autoFocus onClick={onClose} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle">Cancel</button>
          <button disabled={busy} onClick={() => void remove()} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-medium text-white disabled:opacity-40">
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
