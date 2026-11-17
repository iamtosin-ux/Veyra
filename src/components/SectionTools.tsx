"use client";

import { useMemo, useRef, useState } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { PACK_SECTIONS, SECTION_KEYS, type SectionKey } from "@/lib/sections";
import { Icon, type IconName } from "./Icon";
import { Popover } from "./Popover";
import { toast } from "@/lib/toast";
import { ErrorNote, cx, inputCls } from "./ui";

export interface Assignment {
  id: string;
  section: string;
  assignee: string;
  assignee_kind: "person" | "team";
  note: string;
  status: "open" | "done";
  created_at: string;
  created_by_name: string | null;
}

export interface WebSource {
  id: string;
  section: string;
  url: string;
  title: string;
  excerpt: string;
  relevance: string;
  origin: "link" | "search";
  status: "proposed" | "approved" | "dismissed";
  retrieved_at: string;
  decided_by_name: string | null;
}

interface Entry {
  kind: "person" | "team";
  id: string | null;
  name: string;
  detail: string;
}

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function HeaderButton({ icon, label, onClick, open, refFn, dot }: { icon: IconName; label: string; onClick: () => void; open: boolean; refFn: (el: HTMLButtonElement | null) => void; dot?: boolean }) {
  return (
    <button
      ref={refFn}
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      className={cx("group relative grid h-7 w-7 place-items-center rounded-lg", open ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-muted hover:bg-hover hover:text-ink")}
    >
      <Icon name={icon} size={15} />
      {dot && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#d9822b]" />}
    </button>
  );
}

/** Human in the loop: tag a person or team to review this section. */
export function SectionReview({ caseId, section, assignments, reload }: { caseId: string; section: string; assignments: Assignment[]; reload: () => void }) {
  const dir = useApi<{ entries: Entry[] }>("/api/directory");
  const me = useApi<{ user: { id: string; name: string } }>("/api/auth/me");
  const [q, setQ] = useState("");
  const [hover, setHover] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = assignments.filter((a) => a.status === "open");
  const assigned = (name: string) => open.find((a) => a.assignee.toLowerCase() === name.toLowerCase());

  const people = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (dir.data?.entries ?? [])
      .filter((e) => e.id !== me.data?.user.id)
      .filter((e) => !t || e.name.toLowerCase().includes(t) || e.detail.toLowerCase().includes(t))
      .slice(0, 8);
  }, [dir.data, q, me.data]);
  const showNone = !q.trim();
  // Rows in keyboard order: No assignee, people, then Invite and assign.
  const rows = [...(showNone ? ["none"] : []), ...people.map((_, i) => `p${i}`), "invite"];

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      reload();
      void dir.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign");
    }
  };
  const unassignAll = () => run(() => Promise.all(open.map((a) => api(`/api/cases/${caseId}/assignments/${a.id}`, { method: "DELETE" }))), open.length ? "Reviewers removed" : undefined);
  const toggle = (e: Entry) => {
    const a = assigned(e.name);
    return run(
      () => (a ? api(`/api/cases/${caseId}/assignments/${a.id}`, { method: "DELETE" }) : api(`/api/cases/${caseId}/assignments`, { method: "POST", json: { section, assignee: e.name, kind: e.kind, note: "" } })),
      a ? `Unassigned ${e.name}` : `Assigned ${e.name} to review`,
    );
  };
  const invite = () => {
    const name = q.trim();
    if (!name) return inputRef.current?.focus();
    setQ("");
    return run(() => api(`/api/cases/${caseId}/assignments`, { method: "POST", json: { section, assignee: name, kind: "person", note: "" } }), `Invited and assigned ${name}`);
  };
  const choose = (key: string | undefined) => {
    if (key === "none") void unassignAll();
    else if (key === "invite") void invite();
    else if (key) void toggle(people[Number(key.slice(1))]);
  };

  const rowCls = (i: number) => cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px]", i === hover && "bg-hover");

  return (
    <Popover
      width={240}
      trigger={({ open: o, toggle: t, ref }) => (
        <span className="flex items-center gap-1">
          {open.length > 0 && (
            <span className="flex -space-x-1.5" title={open.map((a) => `${a.assignee} to review`).join("\n")}>
              {open.slice(0, 3).map((a) => (
                <span key={a.id} className={cx("grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold text-white ring-2 ring-[#fafaf9]", a.assignee_kind === "team" ? "bg-[#6b4fc8]" : "bg-[#d9822b]")}>
                  {initials(a.assignee)}
                </span>
              ))}
            </span>
          )}
          <HeaderButton icon="humanReview" label="Review and approve" onClick={t} open={o} refFn={ref} />
        </span>
      )}
    >
      {() => (
        <div>
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHover(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHover((h) => Math.min(h + 1, rows.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHover((h) => Math.max(h - 1, 0));
              }
              if (e.key === "Enter") choose(rows[hover]);
            }}
            placeholder="Assign to..."
            aria-label="Assign to"
            className="h-12 w-full bg-transparent px-4 text-[14px] outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <ul className="max-h-72 overflow-auto p-1.5" role="listbox" aria-label="Reviewers">
            {showNone && (
              <li>
                <button role="option" aria-selected={hover === 0} onMouseEnter={() => setHover(0)} onClick={() => choose("none")} className={rowCls(0)}>
                  <Icon name="humanReview" size={18} className="text-muted" />
                  <span className="flex-1">No assignee</span>
                  {open.length === 0 && <Icon name="check" size={16} />}
                </button>
              </li>
            )}
            {people.map((p, i) => {
              const idx = i + (showNone ? 1 : 0);
              const a = assigned(p.name);
              return (
                <li key={`${p.kind}:${p.id ?? p.name}`} className="group/row relative">
                  <button role="option" aria-selected={hover === idx} onMouseEnter={() => setHover(idx)} onClick={() => choose(`p${i}`)} className={rowCls(idx)}>
                    <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white", p.kind === "team" ? "bg-[#6b4fc8]" : "bg-[#d9822b]")}>{initials(p.name)}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {a && <Icon name="check" size={16} />}
                  </button>
                  {a && (
                    <span className="absolute right-9 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/row:flex">
                      <button
                        onClick={() => {
                          const note = window.prompt("What needs to change?");
                          if (note !== null) void run(() => api(`/api/cases/${caseId}/assignments/${a.id}`, { method: "PATCH", json: { status: "changes", note } }), "Changes requested");
                        }}
                        title="Request changes"
                        aria-label={`Request changes from ${p.name}`}
                        className="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink"
                      >
                        <Icon name="refresh" size={14} />
                      </button>
                      <button
                        onClick={() => void run(() => api(`/api/cases/${caseId}/assignments/${a.id}`, { method: "PATCH", json: { status: "done" } }), "Section approved")}
                        title="Approve as accurate"
                        aria-label={`Approve for ${p.name}`}
                        className="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ok"
                      >
                        <Icon name="findings" size={14} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
            <li className="px-2.5 pb-1 pt-2.5 text-[13px] text-muted">New user</li>
            <li>
              <button role="option" aria-selected={hover === rows.length - 1} onMouseEnter={() => setHover(rows.length - 1)} onClick={() => choose("invite")} className={rowCls(rows.length - 1)}>
                <Icon name="invite" size={17} />
                <span className="min-w-0 flex-1 truncate">{q.trim() ? `Invite and assign “${q.trim()}”` : "Invite and assign..."}</span>
              </button>
            </li>
          </ul>
          {error && <div className="px-3 pb-3"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      )}
    </Popover>
  );
}

/**
 * Web sources from the chat input: pick the section, then search (needs AI) or
 * add a link. Results are proposed in the chat and only enter the section once approved.
 */
/**
 * Web sources in the chat: one switch. When on, Veyra also searches the web for each
 * question and proposes what it finds; nothing joins the case until it's approved.
 */
export function ChatWebSource({ aiConfigured, enabled, onChange, disabled }: { aiConfigured: boolean; enabled: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const on = enabled && aiConfigured;
  return (
    <Popover
      width={260}
      side="top"
      align="left"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          onClick={toggle}
          disabled={disabled}
          title={on ? "Web sources on" : "Web sources off"}
          aria-label={on ? "Web sources on" : "Web sources off"}
          aria-expanded={open}
          className={cx("relative grid h-8 w-8 place-items-center rounded-lg hover:bg-hover hover:text-ink", open || on ? "text-ink" : "text-muted", open && "bg-hover")}
        >
          <Icon name="globe" size={17} />
          {on && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />}
        </button>
      )}
    >
      {() => (
        <div className="p-3">
          <label className={cx("flex items-center gap-3 px-1", aiConfigured ? "cursor-pointer" : "cursor-not-allowed")}>
            <span className="flex-1 text-[13px] font-medium">Web sources</span>
            <button
              role="switch"
              aria-checked={on}
              aria-label="Include web sources"
              disabled={!aiConfigured}
              onClick={() => onChange(!enabled)}
              className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-line-strong")}
            >
              <span className={cx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", on && "translate-x-4")} />
            </button>
          </label>
          {!aiConfigured && <p className="mt-1.5 px-1 text-[12px] text-muted">Needs AI to be connected.</p>}
        </div>
      )}
    </Popover>
  );
}

/** Approved web sources inside a section, visually distinct from evidence. */
export function SectionWebSources({ sources }: { sources: WebSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-[#9cc3e4] bg-[#f4f9fd] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#2f6fa3]">
        <Icon name="globe" size={12} /> From the web · not evidence
      </p>
      <ul className="mt-1.5 space-y-2">
        {sources.map((w) => (
          <li key={w.id} className="text-[13px]">
            <a href={w.url} target="_blank" rel="noreferrer noopener" className="font-medium text-[#1f5a8a] hover:underline">
              {w.title}
            </a>
            <span className="ml-1.5 text-[11px] text-faint">{hostname(w.url)}</span>
            {w.excerpt && <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{w.excerpt}</p>}
            <p className="mt-0.5 text-[11px] text-faint">
              {w.origin === "search" ? "Found by AI web search" : "Added by link"} · approved{w.decided_by_name ? ` by ${w.decided_by_name}` : ""} · retrieved {formatDateTime(w.retrieved_at)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function hostname(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export interface SectionSettings {
  instructions?: string;
  citations?: boolean;
  collapsed?: boolean;
  hidden?: boolean;
}

/**
 * The section's cog: what feeds it and how it's produced, instructions that
 * steer the next analysis, and display options.
 */
export function SectionSettingsMenu({
  title,
  settings,
  onChange,
  copyText,
  sectionId,
  rerun,
  citations: showCitations = true,
}: {
  /** Whether the section has citations to show or hide. */
  citations?: boolean;
  title: string;
  settings: SectionSettings;
  onChange: (patch: SectionSettings) => Promise<void>;
  /** Left out for a section whose text isn't copied, only linked to. */
  copyText?: () => string;
  sectionId: string;
  rerun?: { disabled?: string; run: (instructions: string) => Promise<void> };
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const instructions = draft ?? settings.instructions ?? "";
  const citations = settings.citations !== false;

  const copy = async (text: string, done: string) => {
    await navigator.clipboard?.writeText(text);
    setNote(done);
    setTimeout(() => setNote(null), 1500);
  };
  const saveInstructions = async () => {
    if (draft == null || draft === (settings.instructions ?? "")) return;
    await onChange({ instructions: draft });
    setDraft(null);
  };

  return (
    <Popover
      width={264}
      trigger={({ open, toggle, ref }) => <HeaderButton icon="settings" label="Section settings" onClick={toggle} open={open} refFn={ref} />}
    >
      {(close) => (
        <div className="py-1.5">
          <div className="flex items-center gap-1 px-4 py-2">
            <p className="flex-1 truncate text-[14px] font-medium">{title}</p>
            {copyText && (
              <button onClick={() => void copy(copyText(), "Section copied")} title="Copy section text" aria-label="Copy section text" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                <Icon name="copy" size={15} />
              </button>
            )}
            {rerun && (
              <button
                disabled={!!rerun.disabled || busy}
                onClick={async () => {
                  setBusy(true);
                  await saveInstructions();
                  await rerun.run(instructions).catch((e) => setNote(e instanceof Error ? e.message : "Could not start"));
                  setBusy(false);
                }}
                title={rerun.disabled ?? "Re-run analysis"}
                aria-label="Re-run analysis"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-40"
              >
                <Icon name="reanalyse" size={15} />
              </button>
            )}
          </div>
          {showCitations && <dl className="space-y-0.5 px-4 text-[13px]">
            <div className="flex h-8 items-center justify-between gap-3">
              <dt className="text-muted">Citations</dt>
              <dd>
                <button
                  role="switch"
                  aria-checked={citations}
                  aria-label="Show citations"
                  onClick={() => void onChange({ citations: !citations })}
                  className={cx("relative h-5 w-9 rounded-full", citations ? "bg-primary" : "bg-line-strong")}
                >
                  <span className={cx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", citations && "translate-x-4")} />
                </button>
              </dd>
            </div>
          </dl>}
          {rerun && (
            <div className="px-3 pt-2">
              <textarea
                value={instructions}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void saveInstructions()}
                rows={4}
                placeholder="Instructions for the next analysis, e.g. focus on times and who was present"
                aria-label="Section instructions"
                className="w-full resize-y rounded-xl bg-subtle px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-faint focus:ring-1 focus:ring-line-strong"
              />
              <button
                disabled={!!rerun.disabled || busy}
                onClick={async () => {
                  setBusy(true);
                  await saveInstructions();
                  try {
                    await rerun.run(instructions);
                    close();
                  } catch (e) {
                    setNote(e instanceof Error ? e.message : "Could not start");
                  }
                  setBusy(false);
                }}
                className="mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-subtle text-[13px] text-muted hover:bg-hover hover:text-ink disabled:opacity-50"
                title={rerun.disabled}
              >
                <Icon name="reanalyse" size={14} /> {busy ? "Starting…" : rerun.disabled ?? "Re-run analysis"}
              </button>
            </div>
          )}
          {note && <p className="px-4 pt-2 text-[12px] text-muted">{note}</p>}
          <div className="my-1.5 h-px bg-line" />
          <ul className="px-1.5 text-[13px]">
            {(
              [
                [settings.collapsed ? "Expand section" : "Collapse section", "chevron", () => onChange({ collapsed: !settings.collapsed })],
              ] as const
            ).map(([label, icon, run]) => (
              <li key={label}>
                <button onClick={() => { void run(); close(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover">
                  <Icon name={icon} size={15} className={cx("text-muted", icon === "chevron" && !settings.collapsed && "-rotate-90")} /> {label}
                </button>
              </li>
            ))}
          </ul>
          <div className="my-1.5 h-px bg-line" />
          <ul className="px-1.5 text-[13px]">
            {copyText && (
              <li>
                <button onClick={() => void copy(copyText(), "Section copied")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover">
                  <Icon name="copy" size={15} className="text-muted" /> Copy section text
                </button>
              </li>
            )}
            <li>
              <button onClick={() => void copy(`${window.location.origin}${window.location.pathname}#section-${sectionId}`, "Link copied")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover">
                <Icon name="link" size={15} className="text-muted" /> Copy link to section
              </button>
            </li>
          </ul>
        </div>
      )}
    </Popover>
  );
}
