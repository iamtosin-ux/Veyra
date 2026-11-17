"use client";

import { useEffect, useState } from "react";
import { api, formatBytes, useApi } from "@/lib/client";
import type { EvidenceItem } from "./case/types";
import { evidenceIcon } from "./EvidenceModal";
import { Icon } from "./Icon";
import { ErrorNote, cx } from "./ui";

interface FolderLite {
  id: string;
  title: string;
  archived: boolean;
  files: number;
  subfolders: number;
  case_id: string | null;
}

type LinkResult = { ok: true; filename: string; evidence: { id: string; reference: string } } | { ok: false; filename: string; error: string };

/**
 * Choose files from anywhere in the vault (any case's folder, standalone folders
 * and their subfolders) to use as evidence in this case.
 */
export function AddFromVaultModal({ caseId, onClose, onAdded }: { caseId: string; onClose: () => void; onAdded: (added: { id: string; reference: string; filename: string }[]) => void }) {
  const [trail, setTrail] = useState<{ id: string; title: string }[]>([]);
  const here = trail[trail.length - 1] ?? null;
  const top = useApi<{ folders: FolderLite[] }>(here ? null : "/api/vault");
  const inside = useApi<{ subfolders: FolderLite[]; files: EvidenceItem[] }>(here ? `/api/vault/${here.id}` : null);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (f: EvidenceItem) =>
    setPicked((p) => {
      const n = new Map(p);
      if (n.has(f.id)) n.delete(f.id);
      else n.set(f.id, f.display_name || f.original_filename);
      return n;
    });

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: LinkResult[] }>(`/api/cases/${caseId}/evidence/link`, { method: "POST", json: { ids: [...picked.keys()] } });
      const failed = r.results.filter((x): x is Extract<LinkResult, { ok: false }> => !x.ok);
      const added = r.results.filter((x): x is Extract<LinkResult, { ok: true }> => x.ok).map((x) => ({ id: x.evidence.id, reference: x.evidence.reference, filename: x.filename }));
      if (added.length) onAdded(added);
      if (failed.length) setError(failed.map((f) => `${f.filename}: ${f.error}`).join("; "));
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the files");
    }
    setBusy(false);
  };

  const folders = ((here ? inside.data?.subfolders : top.data?.folders) ?? []).filter((f) => !f.archived);
  const files = here ? inside.data?.files ?? [] : [];
  const loaded = here ? !!inside.data : !!top.data;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Add from vault">
      <div className="animate-dialog flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center gap-2 px-5 py-3.5">
          {here && (
            <button aria-label="Up one folder" onClick={() => setTrail(trail.slice(0, -1))} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="back" size={15} />
            </button>
          )}
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{here ? here.title.replace(/^DEMO · /, "") : "Add from vault"}</p>
          <button aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>

        <ul className="scroll-panel min-h-0 flex-1 px-3 py-2">
          {folders.map((f) => (
            <li key={f.id}>
              <button onClick={() => setTrail([...trail, { id: f.id, title: f.title }])} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                <Icon name="folder" size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.title.replace(/^DEMO · /, "")}</span>
                <span className="shrink-0 text-[12px] text-faint">
                  {f.case_id === caseId ? "This case · " : ""}
                  {f.files} item{f.files === 1 ? "" : "s"}
                  {f.subfolders ? ` · ${f.subfolders} folder${f.subfolders === 1 ? "" : "s"}` : ""}
                </span>
                <Icon name="chevron" size={14} className="text-muted" />
              </button>
            </li>
          ))}
          {files.map((f) => {
            const already = (f.used_in ?? []).some((u) => u.case_id === caseId);
            return (
              <li key={f.id}>
                <label className={cx("flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover", already && "opacity-60")}>
                  <input type="checkbox" checked={picked.has(f.id) || already} disabled={already} onChange={() => toggle(f)} className="h-4 w-4 accent-[var(--color-primary)]" />
                  <Icon name={evidenceIcon(f.evidence_type, f.original_filename)} size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{f.display_name || f.original_filename}</span>
                    <span className="block text-[11.5px] text-faint">{already ? "Already in this case" : formatBytes(f.file_size)}</span>
                  </span>
                </label>
              </li>
            );
          })}
          {loaded && folders.length === 0 && files.length === 0 && <li className="px-2 py-4 text-[13px] text-muted">{here ? "This folder is empty." : "The vault has no folders yet."}</li>}
        </ul>

        <div className="px-5 py-3">
          {error && (
            <div className="mb-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted">{picked.size ? `${picked.size} selected` : "Each file gets its own reference in this case."}</p>
            <button onClick={() => void add()} disabled={!picked.size || busy} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:bg-line-strong">
              {busy ? "Adding…" : "Add to case"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
