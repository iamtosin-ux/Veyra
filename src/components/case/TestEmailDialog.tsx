"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/lib/toast";
import { Icon } from "../Icon";
import { inputCls } from "../ui";

/**
 * Send a test email to an upload request's address, as if the contributor had.
 * It goes through the same intake as mail forwarded by the email provider.
 */
export function TestEmailDialog({ caseId, inviteId, address, contact, onClose, onSent }: { caseId: string; inviteId: string; address: string; contact: string | null; onClose: () => void; onSent: () => void }) {
  const [from, setFrom] = useState(contact ?? "");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    const form = new FormData();
    form.set("from", from);
    form.set("subject", subject);
    form.set("text", text);
    for (const f of files) form.append("files", f);
    try {
      const r = await fetch(`/api/cases/${caseId}/invites/${inviteId}/test-email`, { method: "POST", body: form });
      const j = (await r.json()) as { added?: { ok: boolean }[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "The email couldn't be added");
      const added = (j.added ?? []).filter((a) => a.ok).length;
      toast(added ? `Email received · ${added} item${added === 1 ? "" : "s"} added as evidence` : "Email received, but nothing could be added");
      onSent();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The email couldn't be added", { tone: "danger" });
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Send a test email"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="animate-dialog relative w-full max-w-[460px] space-y-2.5 rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold">Send a test email</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">To {address}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={17} />
          </button>
        </div>
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From (email address)" aria-label="From" className={inputCls} />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={inputCls} />
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" aria-label="Message" className={inputCls} />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[13px] text-muted hover:text-ink">
          <Icon name="paperclip" size={15} />
          {files.length ? `${files.length} attachment${files.length === 1 ? "" : "s"}` : "Attach files"}
          <input type="file" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-8 rounded-lg px-3 text-[13px] font-medium hover:bg-hover">Cancel</button>
          <button type="submit" disabled={busy || (!text.trim() && files.length === 0)} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
