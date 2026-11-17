"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Icon, type IconName } from "./Icon";
import { Popover } from "./Popover";
import { ErrorNote, cx, inputCls } from "./ui";

interface Option {
  key: string;
  icon: IconName;
  label: string;
  hint: string;
  run: () => void;
}

/** The chat input's + button: a panel of ways to bring material into the case. */
export function ChatAddMenu({ disabled, onFiles, onFolder, onVault, onDocument }: { disabled?: boolean; onFiles: () => void; onFolder: () => void; onVault: () => void; onDocument: () => void }) {
  const options: Option[] = [
    { key: "files", icon: "paperclip", label: "Add files", hint: "Upload from your computer", run: onFiles },
    { key: "folder", icon: "folder", label: "Add a folder", hint: "Upload everything in a folder", run: onFolder },
    { key: "vault", icon: "vault", label: "Add from vault", hint: "Use files from any case or vault folder", run: onVault },
    { key: "document", icon: "text", label: "Create document", hint: "Write a statement, note or letter", run: onDocument },
  ];
  return (
    <Popover
      align="left"
      side="top"
      width={420}
      trigger={({ toggle, ref, open }) => (
        <button ref={ref} onClick={toggle} disabled={disabled} aria-expanded={open} aria-haspopup="menu" title="Add" aria-label="Add files, vault items or a document" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <Icon name="plus" size={17} />
        </button>
      )}
    >
      {(close) => (
        <ul role="menu" className="p-1.5">
          {options.map((o) => (
            <li key={o.key} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  close();
                  o.run();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover focus-visible:bg-hover"
              >
                <Icon name={o.icon} size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate text-[14px]">
                  {o.label}
                  <span className="ml-2 text-faint">{o.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

/** Write a document (statement, note, letter) straight into the case as a written account. */
export function CreateDocumentModal({ caseId, onClose, onCreated }: { caseId: string; onClose: () => void; onCreated: (doc: { id: string; reference: string; filename: string }) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ result: { ok: boolean; evidence?: { id: string; reference: string; original_filename: string }; error?: string } }>(`/api/cases/${caseId}/evidence/text`, {
        method: "POST",
        json: { title: title.trim(), author: author.trim(), text },
      });
      if (!r.result.ok || !r.result.evidence) throw new Error(r.result.error ?? "Could not create the document");
      onCreated({ id: r.result.evidence.id, reference: r.result.evidence.reference, filename: r.result.evidence.original_filename });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the document");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Create document">
      <div className="animate-dialog flex max-h-[85vh] w-full max-w-[600px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <p className="min-w-0 flex-1 text-[15px] font-semibold">Create document</p>
          <button aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="scroll-panel min-h-0 flex-1 space-y-3 px-5 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,200px)] gap-2">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Statement of the tenant in 3C" aria-label="Title" className={inputCls} />
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Written by (optional)" aria-label="Written by" className={inputCls} />
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder="Write or paste the document…" aria-label="Document text" className={cx(inputCls, "resize-y leading-relaxed")} />
          <p className="text-[12px] text-muted">Added to the case as a written account, attributed to the author you give. It&apos;s kept separate from original files.</p>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3">
          <button onClick={onClose} className="h-8 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink">
            Cancel
          </button>
          <button onClick={() => void create()} disabled={busy || !title.trim() || !text.trim()} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:bg-line-strong">
            {busy ? "Creating…" : "Add to case"}
          </button>
        </div>
      </div>
    </div>
  );
}
