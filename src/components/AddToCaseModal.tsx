"use client";

import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { cx, inputCls } from "./ui";

interface CaseLite {
  id: string;
  title: string;
  reference: string;
  archived: boolean;
}

type LinkResult = { ok: true; evidence: { reference: string } } | { ok: false; error: string };

/** Use a vault file in a case. The case gets its own evidence item; the file stays in the vault. */
export function AddToCaseModal({ file, usedIn, onClose, onAdded }: { file: { id: string; name: string }; usedIn: string[]; onClose: () => void; onAdded: () => void }) {
  const cases = useApi<{ cases: CaseLite[] }>("/api/cases");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const query = q.trim().toLowerCase();
  const list = (cases.data?.cases ?? []).filter((c) => !c.archived && (!query || `${c.title} ${c.reference}`.toLowerCase().includes(query)));

  const add = async (c: CaseLite) => {
    setBusy(c.id);
    try {
      const r = await api<{ results: LinkResult[] }>(`/api/cases/${c.id}/evidence/link`, { method: "POST", json: { ids: [file.id] } });
      const res = r.results[0];
      if (res?.ok) {
        toast(`Added to ${c.title.replace(/^DEMO · /, "")} as ${res.evidence.reference}`);
        onAdded();
        onClose();
      } else toast(res?.error ?? "Could not add the file", { tone: "danger" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the file", { tone: "danger" });
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Add to case">
      <div className="animate-dialog flex max-h-[80vh] w-full max-w-[460px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            Add to case<span className="font-normal text-muted"> · {file.name}</span>
          </p>
          <button aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="px-5 pt-4">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases" aria-label="Search cases" className={inputCls} />
        </div>
        <ul className="scroll-panel min-h-0 flex-1 px-3 pb-3 pt-2">
          {list.map((c) => {
            const already = usedIn.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  disabled={already || !!busy}
                  onClick={() => void add(c)}
                  className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover disabled:hover:bg-transparent", already && "opacity-60")}
                >
                  <Icon name="folder" size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{c.title.replace(/^DEMO · /, "")}</span>
                    <span className="block tabular-nums text-[11px] text-faint">{c.reference}</span>
                  </span>
                  <span className="text-[12px] text-muted">{already ? "In this case" : busy === c.id ? "Adding…" : ""}</span>
                </button>
              </li>
            );
          })}
          {cases.data && list.length === 0 && <li className="px-2 py-4 text-[13px] text-muted">No cases found.</li>}
        </ul>
      </div>
    </div>
  );
}
