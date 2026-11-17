"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/base/modal/modal";
import { useApi } from "@/lib/client";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "./Icon";
import type { Inbox } from "./InboxSheet";

interface SearchCase {
  id: string;
  title: string;
  reference?: string;
  summary?: string | null;
  updated_at?: string;
  archived?: boolean;
}

type Kind = "all" | "inbox" | "cases" | "vault" | "projects";
const KINDS: [Kind, string][] = [
  ["all", "All"],
  ["inbox", "Inbox"],
  ["cases", "Cases"],
  ["vault", "Vault"],
  ["projects", "Projects"],
];

interface Hit {
  key: string;
  group: string;
  title: string;
  detail?: string;
  icon: IconName;
  href: string;
}

const clean = (t: string) => t.replace(/^DEMO · /, "");

// Things to start from search, shown under All.
const ACTIONS: Hit[] = [
  { key: "a-case", group: "Actions", title: "New case", icon: "plus", href: "/?new=1" },
  { key: "a-record", group: "Actions", title: "Record a conversation", icon: "mic", href: "/record" },
  { key: "a-vault", group: "Actions", title: "Upload to the Vault", icon: "vault", href: "/vault" },
];

/**
 * Search across the inbox, cases, the Vault and projects, opened from the
 * sidebar or ⌘K. Arrow keys move through results, ← and → change type, Enter
 * opens, and Tab takes what was typed to the home composer as a new case.
 */
export function SearchDialog({ open, onClose, cases }: { open: boolean; onClose: () => void; cases: SearchCase[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wants = (k: Kind) => open && (kind === "all" || kind === k);
  const inbox = useApi<Inbox>(wants("inbox") ? "/api/inbox" : null);
  const vault = useApi<{ folders: { id: string; title: string; archived: boolean }[] }>(wants("vault") ? "/api/vault" : null);
  const projects = useApi<{ projects: { id: string; name: string; description: string }[] }>(wants("projects") ? "/api/projects" : null);

  const t = q.trim().toLowerCase();
  const has = (...s: (string | null | undefined)[]) => !t || s.join(" ").toLowerCase().includes(t);
  const limit = kind === "all" ? (t ? 4 : 6) : 50;

  const caseHits: Hit[] = [...cases.filter((c) => !c.archived)]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .filter((c) => has(c.title, c.reference, c.summary))
    .slice(0, limit)
    .map((c) => ({ key: c.id, group: kind === "all" && !t ? "Recents" : "Cases", title: clean(c.title), detail: c.reference, icon: "folder", href: `/cases/${c.id}` }));
  const inboxHits: Hit[] = (inbox.data?.items ?? [])
    .map((i) => ({ i, title: `${i.actor ?? "Veyra"} ${i.verb}${i.object ? ` ${i.object}` : ""}` }))
    .filter(({ i, title }) => has(title, i.case_title, i.snippet))
    .slice(0, limit)
    .map(({ i, title }) => {
      const p = new URLSearchParams();
      if (i.target.view) p.set("view", i.target.view);
      if (i.target.section) p.set("section", i.target.section);
      return { key: `i${i.id}`, group: "Inbox", title, detail: clean(i.case_title), icon: "inbox" as const, href: `/cases/${i.case_id}${p.size ? `?${p}` : ""}` };
    });
  const vaultHits: Hit[] = (vault.data?.folders ?? [])
    .filter((f) => !f.archived && has(f.title))
    .slice(0, limit)
    .map((f) => ({ key: `v${f.id}`, group: "Vault", title: clean(f.title), icon: "vault", href: `/vault/${f.id}` }));
  const projectHits: Hit[] = (projects.data?.projects ?? [])
    .filter((p) => has(p.name, p.description))
    .slice(0, limit)
    .map((p) => ({ key: `p${p.id}`, group: "Projects", title: p.name, icon: "projects", href: `/projects/${p.id}` }));

  const hits: Hit[] =
    kind === "all"
      ? t
        ? [...caseHits, ...inboxHits, ...vaultHits, ...projectHits, ...ACTIONS.filter((a) => has(a.title))]
        : [...caseHits, ...ACTIONS]
      : { inbox: inboxHits, cases: caseHits, vault: vaultHits, projects: projectHits }[kind];

  // What the current type is waiting on, and what failed to load.
  const sources = kind === "all" ? [inbox, vault, projects] : kind === "inbox" ? [inbox] : kind === "vault" ? [vault] : kind === "projects" ? [projects] : [];
  const loading = sources.some((s) => s.loading);
  const failed = sources.find((s) => s.error);
  const searchAll = (kind === "all" || kind === "cases") && !!t;
  const count = hits.length + (searchAll ? 1 : 0);

  const close = () => {
    setQ("");
    setActive(0);
    setKind("all");
    onClose();
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const openActive = () => {
    if (hits[active]) go(hits[active].href);
    else if (searchAll) go(`/cases?q=${encodeURIComponent(q.trim())}`);
  };
  const switchKind = (step: number) => {
    const i = KINDS.findIndex(([k]) => k === kind);
    setKind(KINDS[(i + step + KINDS.length) % KINDS.length]![0]);
    setActive(0);
  };

  const empty = { all: "No cases yet.", inbox: "Nothing in your inbox.", cases: "No cases yet.", vault: "No Vault folders yet.", projects: "No projects yet." }[kind];

  return (
    <Modal isOpen={open} onOpenChange={(o) => !o && close()} size="lg" aria-label="Search" className="gap-0 py-0">
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, count - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                switchKind(e.key === "ArrowRight" ? 1 : -1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                openActive();
              } else if (e.key === "Tab" && q.trim()) {
                e.preventDefault();
                go(`/?prompt=${encodeURIComponent(q.trim())}`);
              }
            }}
            placeholder="Search"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button onClick={close} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="mt-3 flex gap-1 pb-3" role="tablist" aria-label="Search in">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                setActive(0);
              }}
              className={cx("h-8 rounded-full px-3.5 text-[13px]", kind === k ? "bg-subtle font-medium text-ink" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="scroll-panel h-[360px] border-t border-separator-border p-2" role="listbox" aria-label="Results">
        {hits.map((h, i) => (
          <li key={h.key}>
            {h.group !== hits[i - 1]?.group && <p className="px-3 pb-1 pt-3 text-[12px] text-text-tertiary">{h.group}</p>}
            <button
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h.href)}
              className={cx("flex w-full items-center gap-3 rounded-[calc(var(--radius-3xl)-0.5rem)] px-3 py-2.5 text-left", i === active && "bg-background-secondary-default")}
            >
              <Icon name={h.icon} size={16} className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-text-primary">{h.title}</span>
              {h.detail && <span className="max-w-[40%] shrink-0 truncate text-[12px] text-text-tertiary">{h.detail}</span>}
              <span aria-hidden className={cx("w-4 shrink-0 text-center text-[13px] text-text-tertiary", i !== active && "invisible")}>↵</span>
            </button>
          </li>
        ))}
        {searchAll && (
          <li>
            <button
              onMouseEnter={() => setActive(hits.length)}
              onClick={openActive}
              className={cx("flex w-full items-center gap-3 rounded-[calc(var(--radius-3xl)-0.5rem)] px-3 py-2.5 text-left text-[14px] text-text-secondary", active === hits.length && "bg-background-secondary-default")}
            >
              <Icon name="search" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Search cases for “{q.trim()}”</span>
            </button>
          </li>
        )}

        {/* Waiting, failed, nothing there yet, or nothing matching */}
        {loading && hits.length === 0 && <li className="shimmer-text px-3 py-3 text-[14px]">Loading</li>}
        {failed && (
          <li className="flex items-center gap-3 px-3 py-3 text-[14px] text-text-secondary">
            <span className="flex-1">Couldn&apos;t load everything.</span>
            <button onClick={() => sources.forEach((s) => void s.reload())} className="rounded-lg px-2.5 py-1 text-[13px] text-ink hover:bg-hover">
              Try again
            </button>
          </li>
        )}
        {!loading && !failed && hits.length === 0 && <li className="px-3 py-3 text-[14px] text-text-secondary">{t ? `No matches for “${q.trim()}”.` : empty}</li>}
      </ul>

      <div className="flex items-center gap-5 border-t border-separator-border px-5 py-3 text-[12px] text-text-secondary">
        <Shortcut label="Close" keys={["Esc"]} />
        <Shortcut label="Change type" keys={["←", "→"]} />
        <Shortcut label="Open" keys={["↵"]} />
        <span className="ml-auto">
          <Shortcut label="New case from search" keys={["Tab"]} />
        </span>
      </div>
    </Modal>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {keys.map((k) => (
        <kbd key={k} className="grid h-5 min-w-5 place-items-center rounded-md border border-separator-border px-1 font-sans text-[11px] text-text-secondary">
          {k}
        </kbd>
      ))}
    </span>
  );
}
