"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { cx, inputCls } from "./ui";

export interface VaultOfferData {
  evidenceIds: string[];
  status: "pending" | "added" | "dismissed";
  folder: { id: string | null; title: string };
}

interface FolderLite {
  id: string;
  title: string;
  archived: boolean;
  subfolders: number;
  case_id: string | null;
}

/**
 * Veyra's question after files are added in chat: put them in the vault too?
 * Defaults to the case's own folder; another folder or subfolder can be chosen.
 */
export function VaultOfferCard({ caseId, messageId, offer, onDone }: { caseId: string; messageId?: string; offer: VaultOfferData; onDone: (added: boolean) => void }) {
  const [target, setTarget] = useState<{ id: string | null; title: string }>(offer.folder);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = offer.evidenceIds.length;

  const answer = async (dismiss: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}/vault`, { method: "POST", json: { evidenceIds: offer.evidenceIds, folderId: target.id, messageId: messageId ?? null, dismiss } });
      onDone(!dismiss);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(false);
  };

  if (offer.status === "added")
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
        <Icon name="checkFill" size={14} className="text-ink" />
        Added to the vault in{" "}
        {offer.folder.id ? (
          <Link href={`/vault/${offer.folder.id}`} className="font-medium text-ink hover:underline">
            {offer.folder.title.replace(/^DEMO · /, "")}
          </Link>
        ) : (
          offer.folder.title
        )}
      </p>
    );
  if (offer.status === "dismissed") return null;

  return (
    <div className="mt-2.5 rounded-[20px] border border-line bg-subtle p-1">
      <div className="rounded-[16px] bg-panel px-3.5 py-3">
        <p className="text-[14px] font-medium leading-snug">
          Add {n === 1 ? "this file" : `these ${n} files`} to the vault?
        </p>
        <p className="mt-0.5 text-[12px] text-muted">They stay in this case either way. In the vault, other cases can use them too.</p>
        <button onClick={() => setChoosing(true)} className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-[12px] hover:bg-subtle">
          <Icon name="folder" size={13} className="shrink-0 text-muted" />
          <span className="truncate">{target.title.replace(/^DEMO · /, "")}</span>
          {target.id === offer.folder.id && <span className="shrink-0 text-faint">· case folder</span>}
          <Icon name="chevron" size={13} className="shrink-0 rotate-90 text-muted" />
        </button>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </div>
      <div className="flex items-center gap-1 px-1.5 pb-0.5 pt-1">
        <button disabled={busy} onClick={() => void answer(false)} className="h-8 rounded-[14px] bg-primary px-3.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Adding…" : "Add to vault"}
        </button>
        <button disabled={busy} onClick={() => void answer(true)} className="h-8 rounded-[14px] px-3.5 text-[13px] font-medium text-muted hover:bg-panel hover:text-ink">
          Not now
        </button>
      </div>
      {choosing && (
        <FolderChooserModal
          caseFolder={offer.folder}
          onClose={() => setChoosing(false)}
          onChoose={(f) => {
            setTarget(f);
            setChoosing(false);
          }}
        />
      )}
    </div>
  );
}

/** Pick a vault folder or subfolder (or make a new one) to file into. */
export function FolderChooserModal({ caseFolder, onClose, onChoose }: { caseFolder?: { id: string | null; title: string }; onClose: () => void; onChoose: (f: { id: string | null; title: string }) => void }) {
  const [trail, setTrail] = useState<{ id: string; title: string }[]>([]);
  const here = trail[trail.length - 1] ?? null;
  const level = useApi<{ folders: FolderLite[] }>(`/api/vault${here ? `?parent=${here.id}` : ""}`);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = async () => {
    setError(null);
    try {
      const r = await api<{ folder: { id: string; title: string } }>("/api/vault", { method: "POST", json: { name: name.trim(), parentId: here?.id ?? null } });
      onChoose({ id: r.folder.id, title: r.folder.title });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the folder");
    }
  };

  const folders = (level.data?.folders ?? []).filter((f) => !f.archived);
  // The case folder is offered first at the top level, even before it exists.
  const showCaseFolder = !here && caseFolder && !folders.some((f) => f.id === caseFolder.id);

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Choose a vault folder">
      <div className="animate-dialog flex max-h-[80vh] w-full max-w-[440px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center gap-2 px-5 py-3.5">
          {here && (
            <button aria-label="Up one folder" onClick={() => setTrail(trail.slice(0, -1))} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="back" size={15} />
            </button>
          )}
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{here ? here.title.replace(/^DEMO · /, "") : "Choose a folder"}</p>
          <button aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <ul className="scroll-panel min-h-0 flex-1 px-3 py-2">
          {showCaseFolder && (
            <li>
              <button onClick={() => onChoose(caseFolder!)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                <Icon name="folder" size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{caseFolder!.title.replace(/^DEMO · /, "")}</span>
                <span className="text-[12px] text-faint">Case folder</span>
              </button>
            </li>
          )}
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <button onClick={() => onChoose({ id: f.id, title: f.title })} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                <Icon name="folder" size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.title.replace(/^DEMO · /, "")}</span>
                {f.id === caseFolder?.id && <span className="text-[12px] text-faint">Case folder</span>}
              </button>
              <button onClick={() => setTrail([...trail, { id: f.id, title: f.title }])} aria-label={`Open ${f.title}`} title={f.subfolders ? `${f.subfolders} subfolder${f.subfolders === 1 ? "" : "s"}` : "Open"} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                <Icon name="chevron" size={14} />
              </button>
            </li>
          ))}
          {level.data && folders.length === 0 && !showCaseFolder && <li className="px-2 py-3 text-[13px] text-muted">No subfolders here.</li>}
        </ul>
        <div className="space-y-2 px-5 py-3">
          {here && (
            <button onClick={() => onChoose(here)} className="h-8 w-full rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary-hover">
              Use “{here.title.replace(/^DEMO · /, "")}”
            </button>
          )}
          <div className="flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()} placeholder={here ? "New subfolder" : "New folder"} aria-label="New folder name" className={cx(inputCls, "h-8 py-1 text-[13px]")} />
            <button disabled={!name.trim()} onClick={() => void create()} className="h-8 shrink-0 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium hover:bg-subtle disabled:opacity-45">
              Create
            </button>
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
