"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "../Icon";
import { Menu } from "../Menu";
import { cx } from "../ui";

export type Role = "manager" | "editor" | "viewer";
export const ROLE_LABEL: Record<Role, string> = { manager: "Case manager", editor: "Editor", viewer: "Viewer" };

export interface CaseAccess {
  access: "workspace" | "invited";
  owner: { id: string; name: string; email: string | null; you: boolean } | null;
  members: { id: string; email: string; name: string | null; role: Role; joined: boolean; invited_at: string }[];
}

const initial = (s: string) => (s.trim()[0] ?? "?").toUpperCase();

/** Who can open a case: invite people by email, set their role, and choose general access. */
export function ShareCaseDialog({ caseId, onClose, onSettings, onChanged }: { caseId: string; onClose: () => void; onSettings?: () => void; onChanged?: () => void }) {
  const { data, reload } = useApi<CaseAccess>(`/api/cases/${caseId}/members`);
  const me = useApi<{ organisation: string }>("/api/auth/me");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState<CaseAccess["members"][number] | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done);
      await reload();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", { tone: "danger" });
    }
  };

  const invite = async () => {
    if (!valid) return;
    setBusy(true);
    await run(async () => {
      const r = await api<{ joined: boolean }>(`/api/cases/${caseId}/members`, { method: "POST", json: { email: email.trim(), role } });
      toast(r.joined ? `Added ${email.trim()}` : `Added ${email.trim()}. They'll get access when they join with that email.`);
      setEmail("");
    });
    setBusy(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cases/${caseId}`);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link. Copy it from the address bar instead.", { tone: "danger" });
    }
  };

  const invitedOnly = data?.access === "invited";
  const workspace = me.data?.organisation ?? "the workspace";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Share case" className="animate-dialog relative w-full max-w-[480px] rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">Share case</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">People you add can open and work on this case.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="close" size={18} />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
            className="mt-4 flex gap-2"
          >
            <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line-strong focus-within:border-line-strong">
              <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add people by email" aria-label="Email" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none placeholder:text-faint" />
              <Menu
                align="right"
                width={180}
                items={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ label: ROLE_LABEL[r], checked: role === r, onSelect: () => setRole(r) }))}
                trigger={({ toggle, ref, open }) => (
                  <button type="button" ref={ref} onClick={toggle} aria-expanded={open} className="mr-1 flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] text-muted hover:bg-hover hover:text-ink">
                    {ROLE_LABEL[role]} <Icon name="chevron" size={13} className="rotate-90" />
                  </button>
                )}
              />
            </div>
            <button type="submit" disabled={!valid || busy} className="h-10 shrink-0 rounded-lg bg-primary px-4 text-[14px] font-medium text-white hover:bg-primary-hover disabled:bg-subtle disabled:text-faint">
              Invite
            </button>
          </form>

          <p className="mt-5 text-[13.5px] text-muted">Who has access</p>
          <ul className="mt-2 space-y-1 pb-4">
            <li>
              <Menu
                width={300}
                items={[
                  { label: "Only people invited", hint: "And workspace admins", checked: invitedOnly, onSelect: () => void run(() => api(`/api/cases/${caseId}/members`, { method: "POST", json: { access: "invited" } }), "Only people invited can open this case") },
                  { label: `Anyone in ${workspace}`, checked: !invitedOnly, onSelect: () => void run(() => api(`/api/cases/${caseId}/members`, { method: "POST", json: { access: "workspace" } }), `Anyone in ${workspace} can open this case`) },
                ]}
                trigger={({ toggle, ref, open }) => (
                  <button ref={ref} onClick={toggle} aria-expanded={open} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-subtle">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-ink">
                      <Icon name={invitedOnly ? "lock" : "members"} size={17} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{invitedOnly ? "Only people invited" : `Anyone in ${workspace}`}</span>
                    <Icon name="chevron" size={16} className="text-muted" />
                  </button>
                )}
              />
            </li>
            {data?.owner && (
              <li className="flex items-center gap-3 py-1.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-[14px] font-medium">{initial(data.owner.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px]">
                    {data.owner.name} {data.owner.you && <span className="text-muted">(you)</span>}
                  </span>
                  {data.owner.email && <span className="block truncate text-[13px] text-muted">{data.owner.email}</span>}
                </span>
                <span className="text-[14px] text-muted">Owner</span>
              </li>
            )}
            {data?.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-1.5">
                <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-medium", m.joined ? "bg-subtle" : "border border-dashed border-line-strong text-muted")}>{initial(m.name ?? m.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px]">{m.name ?? m.email}</span>
                  <span className="block truncate text-[13px] text-muted">{m.name ? m.email : "Not joined yet"}</span>
                </span>
                <Menu
                  align="right"
                  width={250}
                  items={[
                    ...(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ label: ROLE_LABEL[r], checked: m.role === r, onSelect: () => void run(() => api(`/api/cases/${caseId}/members/${m.id}`, { method: "PATCH", json: { role: r } }), `${m.name ?? m.email} is now ${ROLE_LABEL[r].toLowerCase()}`) })),
                    { kind: "separator" as const },
                    m.role === "manager" && m.joined
                      ? { label: "Transfer ownership", icon: "transfer" as const, onSelect: () => setTransferring(m) }
                      : { label: "Transfer ownership", icon: "transfer" as const, disabled: true, hint: m.joined ? "Case managers only" : "Not joined yet", onSelect: () => {} },
                    { label: "Remove access", danger: true, onSelect: () => void run(() => api(`/api/cases/${caseId}/members/${m.id}`, { method: "DELETE" }), `Removed ${m.name ?? m.email}`) },
                  ]}
                  trigger={({ toggle, ref, open }) => (
                    <button ref={ref} onClick={toggle} aria-expanded={open} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[14px] text-muted hover:bg-hover hover:text-ink">
                      {ROLE_LABEL[m.role]} <Icon name="chevron" size={13} className="rotate-90" />
                    </button>
                  )}
                />
              </li>
            ))}
          </ul>
          {transferring ? (
            <div className="mb-4 rounded-xl bg-subtle px-3.5 py-3">
              <p className="text-[14px] font-medium">Make {transferring.name ?? transferring.email} the owner?</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                They&apos;ll own the case and decide who has access. {data?.owner?.you ? "You" : data?.owner?.name ?? "The current owner"} will stay on as a case manager.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setTransferring(null)} className="h-8 rounded-lg px-3 text-[13px] font-medium hover:bg-hover">Cancel</button>
                <button
                  onClick={() => {
                    const m = transferring;
                    setTransferring(null);
                    void run(() => api(`/api/cases/${caseId}/members/${m.id}`, { method: "PATCH", json: { owner: true } }), `${m.name ?? m.email} now owns this case`);
                  }}
                  className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
                >
                  Transfer ownership
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          {onSettings && (
            <button onClick={onSettings} aria-label="Case settings" className="grid h-10 w-10 place-items-center rounded-lg bg-subtle text-ink hover:bg-hover">
              <Icon name="settings" size={18} />
            </button>
          )}
          <button onClick={() => void copyLink()} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-medium text-white hover:bg-primary-hover">
            <Icon name="link" size={17} /> Copy link
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
