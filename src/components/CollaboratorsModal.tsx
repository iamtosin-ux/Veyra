"use client";

import { TestEmailDialog } from "./case/TestEmailDialog";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { Chip, ErrorNote, cx, inputCls } from "./ui";

export interface Invite {
  id: string;
  label: string;
  relationship: string | null;
  contact: string | null;
  expires_at: string;
  revoked_at: string | null;
  uploads: number;
  active: boolean;
  team: boolean;
  name: string | null;
  /** The request's own address: mail sent to it becomes evidence. */
  email?: string | null;
}

interface Owner {
  name: string;
  email: string | null;
  you: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

function Avatar({ name, external }: { name: string; external?: boolean }) {
  return (
    <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", external ? "bg-[#fcebd6] text-[#8a4a10]" : "bg-subtle text-muted")}>
      {initials(name)}
    </span>
  );
}

/**
 * Who is involved in a case: the owner, plus everyone invited to upload evidence,
 * each with their role (complainant, expert…) and whether they are in this
 * workspace. Roles describe people; they do not grant permissions.
 */
export function CollaboratorsModal({ caseId, caseTitle, onClose, onChanged }: { caseId: string; caseTitle?: string; onClose: () => void; onChanged?: () => void }) {
  const { data, reload } = useApi<{ invites: Invite[]; owner: Owner | null; roles: string[] }>(`/api/cases/${caseId}/invites`);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState("");
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ email: string; url: string; inbox: string | null }[]>([]);
  const [testing, setTesting] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roles = data?.roles ?? [];
  const pendingDraft = draft.trim().toLowerCase();
  const recipients = [...new Set(EMAIL.test(pendingDraft) ? [...tags, pendingDraft] : tags)];
  // One person: choose their role here. Several: roles are set per person in the list.
  const single = recipients.length + (pendingDraft && !EMAIL.test(pendingDraft) ? 1 : 0) <= 1;
  const ready = recipients.length > 0 && !busy && (!single || !!role) && !(pendingDraft && !EMAIL.test(pendingDraft));

  /** Turn typed or pasted text into email tags; anything invalid stays in the input. */
  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL.test(p));
    const good = parts.filter((p) => EMAIL.test(p) && !tags.includes(p));
    if (good.length) setTags((t) => [...t, ...good]);
    setDraft(bad.join(" "));
    setError(bad.length ? `Check ${bad.join(", ")}` : null);
  };

  const invite = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const out: { email: string; url: string; inbox: string | null }[] = [];
      for (const email of recipients) {
        const r = await api<{ invite: { token: string; email?: string } }>(`/api/cases/${caseId}/invites`, {
          method: "POST",
          json: { label: email, contact: email, relationship: single ? role : null, message, days },
        });
        out.push({ email, url: `${window.location.origin}/upload/${r.invite.token}`, inbox: r.invite.email ?? null });
      }
      setLinks((l) => [...out, ...l]);
      setTags([]);
      setDraft("");
      setRole("");
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invites");
    }
    setBusy(false);
  };

  const setInviteRole = async (i: Invite, r: string) => {
    await api(`/api/cases/${caseId}/invites/${i.id}`, { method: "PATCH", json: { relationship: r } });
    await reload();
  };

  const revoke = async (i: Invite) => {
    await api(`/api/cases/${caseId}/invites/${i.id}`, { method: "DELETE" });
    toast("Invite revoked", { tone: "danger" });
    await reload();
    onChanged?.();
  };

  const mailto = (l: { email: string; url: string; inbox: string | null }) => {
    const subject = `Evidence request${caseTitle ? `: ${caseTitle}` : ""}`;
    const byEmail = l.inbox ? `\n\nYou can also email your evidence to ${l.inbox}. Anything you send there, including attachments, is added to the case.` : "";
    const body = `${message ? `${message}\n\n` : ""}Upload your evidence here:\n${l.url}${byEmail}\n\nThis link and address expire in ${days} days.`;
    return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const invites = data?.invites ?? [];
  const showRole = recipients.length > 0 || !!pendingDraft;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Collaborators">
      <div className="animate-dialog flex max-h-[85vh] w-full max-w-[560px] flex-col gap-2">
        <div className="flex min-h-0 flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">Collaborators</p>
            <button aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="scroll-panel min-h-0 flex-1 px-5 pb-4 pt-4">
            <div className="flex items-start gap-2">
              {/* Emails become tags on comma, space or Enter. */}
              <div className="flex min-h-[38px] min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-md border border-line-strong px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
                {tags.map((t) => (
                  <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[12px]">
                    <span className="truncate">{t}</span>
                    <button aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="text-faint hover:text-ink">
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={draft}
                  autoFocus
                  inputMode="email"
                  autoComplete="off"
                  onChange={(e) => {
                    if (/[,;\s]/.test(e.target.value)) commit(e.target.value);
                    else setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (draft.trim()) commit(draft);
                      else void invite();
                    }
                    if (e.key === "Backspace" && !draft && tags.length) setTags(tags.slice(0, -1));
                  }}
                  onBlur={() => draft.trim() && commit(draft)}
                  placeholder={tags.length ? "" : "Add comma separated emails to invite"}
                  aria-label="Email addresses"
                  className="min-w-[140px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
                />
              </div>
              {showRole && (
                <select
                  value={single ? role : ""}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={!single}
                  aria-label="Role"
                  aria-required={single}
                  title={single ? undefined : "Inviting several people: set each person's role in the list below"}
                  className={cx(inputCls, "w-[140px] shrink-0 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-faint", single && !role && "text-faint")}
                >
                  <option value="" disabled>
                    Role
                  </option>
                  {roles.map((r) => (
                    <option key={r} className="text-ink">
                      {r}
                    </option>
                  ))}
                </select>
              )}
              <button onClick={() => void invite()} disabled={!ready} className="h-[38px] shrink-0 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover disabled:bg-line-strong">
                {busy ? "Inviting…" : "Invite"}
              </button>
            </div>
            {!single && <p className="mt-2 text-[12px] text-muted">Inviting {recipients.length} people. Set each person&apos;s role in the list after inviting.</p>}
            {error && (
              <div className="mt-2">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}

            {testing?.email && (
              <TestEmailDialog
                caseId={caseId}
                inviteId={testing.id}
                address={testing.email}
                contact={testing.contact}
                onClose={() => setTesting(null)}
                onSent={() => {
                  setTesting(null);
                  void reload();
                  onChanged?.();
                }}
              />
            )}
            {/* Links are shown once, straight after inviting. */}
            {links.length > 0 && (
              <div className="mt-4 rounded-xl border border-line bg-subtle p-1">
                <p className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Send each link from your mail app or copy it. Links are shown once.</p>
                <ul className="rounded-[10px] bg-panel">
                  {links.map((l) => (
                    <li key={l.url} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{l.email}</span>
                        {l.inbox && <span className="block truncate text-[12px] text-faint select-all">{l.inbox}</span>}
                      </span>
                      <a href={mailto(l)} className="inline-flex h-7 items-center rounded-lg bg-primary px-2.5 text-[12px] font-medium text-white hover:bg-primary-hover">
                        Email
                      </a>
                      <button
                        onClick={() => void navigator.clipboard?.writeText(l.url).then(() => setCopied(l.url))}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium hover:bg-subtle"
                      >
                        <Icon name={copied === l.url ? "check" : "copy"} size={12} /> {copied === l.url ? "Copied" : "Copy link"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-5 text-[13px] font-medium text-muted">Who&apos;s involved</p>
            <ul className="mt-1">
              {data?.owner && (
                <li className="flex items-center gap-3 py-2">
                  <Avatar name={data.owner.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {data.owner.name}
                      {data.owner.you && <span className="font-normal text-muted"> (you)</span>}
                    </p>
                    {data.owner.email && <p className="truncate text-[12px] text-faint">{data.owner.email}</p>}
                  </div>
                  <span className="w-[112px] pr-1 text-right text-[13px] text-muted">Owner</span>
                </li>
              )}
              {invites.map((i) => (
                <li key={i.id} className={cx("flex items-center gap-3 py-2", !i.active && "opacity-55")}>
                  <Avatar name={i.name ?? i.label} external={!i.team} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{i.name ?? i.contact ?? i.label}</p>
                    {i.name && (i.contact ?? i.label) && <p className="truncate text-[12px] text-faint">{i.contact ?? i.label}</p>}
                  </div>
                  {!i.team && <Chip tone="draft">External</Chip>}
                  <span className="flex w-[112px] justify-end">
                    {i.active ? (
                      <Menu
                        align="right"
                        width={200}
                        items={[
                          { kind: "header", label: "Role" },
                          ...roles.map((r): MenuItem => ({ label: r, checked: i.relationship === r, onSelect: () => void setInviteRole(i, r) })),
                          { kind: "separator" },
                          ...(i.email
                            ? ([
                                { label: "Copy email address", icon: "copy", onSelect: () => void navigator.clipboard?.writeText(i.email!).then(() => toast("Email address copied")) },
                                { label: "Send a test email", icon: "mail", onSelect: () => setTesting(i) },
                                { kind: "separator" },
                              ] as MenuItem[])
                            : []),
                          { label: "Revoke invite", icon: "close", danger: true, onSelect: () => void revoke(i) },
                        ]}
                        trigger={({ toggle, ref, open }) => (
                          <button ref={ref} onClick={toggle} aria-expanded={open} aria-label={`Role for ${i.label}`} className={cx("inline-flex items-center gap-0.5 rounded-lg py-0.5 pl-1.5 pr-1 text-[13px] hover:bg-hover", i.relationship ? "text-ink" : "text-draft")}>
                            {i.relationship ?? "Set role"}
                            <Icon name="chevron" size={14} className="text-muted" />
                          </button>
                        )}
                      />
                    ) : (
                      <span className="pr-1 text-[13px] text-muted">{i.revoked_at ? "Revoked" : "Expired"}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Invite options sit in their own card below. */}
        <div className="shrink-0 rounded-2xl bg-panel p-1.5 shadow-[var(--shadow-dialog)]">
          <label className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] hover:bg-hover">
            <Icon name="timeline" size={16} className="text-muted" />
            <span className="flex-1">Link expires in</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md bg-transparent py-0.5 pl-1 text-right text-[13px] text-muted outline-none">
              {[3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setMessageOpen((o) => !o)} aria-expanded={messageOpen} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] hover:bg-hover">
            <Icon name="pencil" size={16} className="text-muted" />
            <span className="flex-1">{message.trim() ? "Message added" : "Add a message"}</span>
            <Icon name="chevron" size={15} className={cx("text-muted transition-transform", messageOpen && "rotate-90")} />
          </button>
          {messageOpen && (
            <div className="px-3.5 pb-2.5 pt-1">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} autoFocus placeholder="Please upload any photos, recordings or letters about…" className={cx(inputCls, "resize-y")} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
