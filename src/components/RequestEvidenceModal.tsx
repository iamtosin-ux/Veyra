"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { Button, ErrorNote, Field, cx, inputCls } from "./ui";

interface Folder {
  id: string;
  title: string;
  archived: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (t: string) => t.replace(/^DEMO · /, "");

/**
 * Invite people to upload evidence to a case. Each email gets its own private
 * link. Veyra has no mail service, so links are copied or opened in the
 * user's own mail app.
 */
export function RequestEvidenceModal({ caseId: initialCase, onClose, onCreated }: { caseId?: string; onClose: () => void; onCreated?: () => void }) {
  const vault = useApi<{ folders: Folder[]; relationships: string[] }>("/api/vault");
  const [caseId, setCaseId] = useState<string | null>(initialCase ?? null);
  const [caseQuery, setCaseQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [relationship, setRelationship] = useState("");
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ email: string; url: string; inbox: string | null }[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // One person: role chosen here. Several: set per person later in Collaborators.
  const single = emails.length + (EMAIL.test(draft.trim()) ? 1 : 0) <= 1;
  const folders = (vault.data?.folders ?? []).filter((f) => !f.archived);
  const tagged = folders.find((f) => f.id === caseId);
  const q = caseQuery.trim().toLowerCase();
  const matches = folders.filter((f) => !q || clean(f.title).toLowerCase().includes(q)).slice(0, 6);

  const addEmails = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL.test(p));
    const good = parts.filter((p) => EMAIL.test(p) && !emails.includes(p.toLowerCase())).map((p) => p.toLowerCase());
    if (good.length) setEmails((e) => [...e, ...good]);
    setDraft(bad.join(" "));
    setError(bad.length ? `Check ${bad.join(", ")}` : null);
  };

  const send = async () => {
    const all = draft.trim() ? [...emails, ...draft.split(/[\s,;]+/).filter((p) => EMAIL.test(p)).map((p) => p.toLowerCase())] : emails;
    if (!caseId || all.length === 0 || (single && !relationship)) return;
    setBusy(true);
    setError(null);
    try {
      const out: { email: string; url: string; inbox: string | null }[] = [];
      for (const email of [...new Set(all)]) {
        const r = await api<{ invite: { token: string; email?: string } }>(`/api/cases/${caseId}/invites`, {
          method: "POST",
          json: { label: email, contact: email, relationship: single ? relationship : null, message, days },
        });
        out.push({ email, url: `${window.location.origin}/upload/${r.invite.token}`, inbox: r.invite.email ?? null });
      }
      setLinks(out);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invites");
    }
    setBusy(false);
  };

  const mailto = (l: { email: string; url: string; inbox: string | null }) => {
    const subject = `Evidence request: ${tagged ? clean(tagged.title) : "case"}`;
    const byEmail = l.inbox ? `\n\nYou can also email your evidence to ${l.inbox}. Anything you send there, including attachments, is added to the case.` : "";
    const body = `${message ? `${message}\n\n` : ""}Upload your evidence here:\n${l.url}${byEmail}\n\nThis link and address expire in ${days} days.`;
    return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Request evidence">
      <div className="w-full max-w-[520px] rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <p className="text-[16px] font-semibold">Request evidence</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>

        {links ? (
          <div className="px-5 pb-5 pt-2">
            <p className="text-[13px] text-muted">Invites created for {tagged ? clean(tagged.title) : "this folder"}. Send each link from your mail app or copy it.</p>
            <ul className="mt-3 ">
              {links.map((l) => (
                <li key={l.email} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{l.email}</span>
                    {l.inbox && <span className="block truncate text-[12px] text-faint select-all">{l.inbox}</span>}
                  </span>
                  <a href={mailto(l)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[12px] font-medium text-white hover:bg-primary-hover">
                    Email
                  </a>
                  <button
                    onClick={() => void navigator.clipboard?.writeText(l.url).then(() => setCopied(l.email))}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium hover:bg-subtle"
                  >
                    <Icon name={copied === l.email ? "check" : "copy"} size={12} /> {copied === l.email ? "Copied" : "Copy link"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Links are shown once.</p>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 px-5 pb-5 pt-3">
            <Field label="Folder">
              {tagged ? (
                <div className="flex items-center gap-2 rounded-md border border-line-strong px-2 py-1.5">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-subtle px-2 py-0.5 text-[13px]">
                    <Icon name="folder" size={13} className="shrink-0 text-muted" />
                    <span className="truncate">{clean(tagged.title)}</span>
                  </span>
                  {!initialCase && (
                    <button onClick={() => setCaseId(null)} aria-label="Change folder" className="ml-auto text-faint hover:text-ink">
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={caseQuery}
                    onChange={(e) => {
                      setCaseQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    onClick={() => setPickerOpen(true)}
                    onBlur={() => setTimeout(() => setPickerOpen(false), 120)}
                    onKeyDown={(e) => e.key === "Escape" && setPickerOpen(false)}
                    placeholder="Search folders"
                    aria-label="Search folders"
                    aria-expanded={pickerOpen}
                    className={inputCls}
                  />
                  {pickerOpen && (
                  <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-line bg-panel shadow-[var(--shadow-dialog)]">
                    {matches.map((f) => (
                      <li key={f.id}>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setCaseId(f.id); setPickerOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-hover">
                          <Icon name="folder" size={13} className="shrink-0 text-muted" />
                          <span className="truncate">{clean(f.title)}</span>
                        </button>
                      </li>
                    ))}
                    {vault.data && matches.length === 0 && <li className="px-2.5 py-2 text-[13px] text-muted">No folders found</li>}
                  </ul>
                  )}
                </div>
              )}
            </Field>

            <Field label="Send to">
              <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-line-strong px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
                {emails.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[12px]">
                    {e}
                    <button aria-label={`Remove ${e}`} onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-faint hover:text-ink">
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={draft}
                  autoFocus={!!initialCase}
                  type="text"
                  inputMode="email"
                  autoComplete="off"
                  onChange={(e) => {
                    if (/[,;\s]$/.test(e.target.value)) addEmails(e.target.value);
                    else setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      e.preventDefault();
                      addEmails(draft);
                    }
                    if (e.key === "Backspace" && !draft && emails.length) setEmails(emails.slice(0, -1));
                  }}
                  onBlur={() => draft.trim() && addEmails(draft)}
                  placeholder={emails.length ? "" : "name@example.com"}
                  aria-label="Email addresses"
                  className="min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <select
                  value={single ? relationship : ""}
                  onChange={(e) => setRelationship(e.target.value)}
                  disabled={!single}
                  aria-required={single}
                  title={single ? undefined : "Inviting several people: set each person's role in Collaborators"}
                  className={cx(inputCls, "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-faint")}
                >
                  <option value="" disabled>Choose a role</option>
                  {(vault.data?.relationships ?? []).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Link expires after">
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>
                  {[3, 7, 14, 30, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Message">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Please upload any photos, recordings or letters about…" className={cx(inputCls, "resize-y")} />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={busy || !caseId || (single && !relationship) || (emails.length === 0 && !EMAIL.test(draft.trim()))} onClick={() => void send()}>
                {busy ? "Creating…" : "Send invite"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
