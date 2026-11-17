"use client";

import { LogoMark } from "@/components/Logo";
import { readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/client";
import { Icon, type IconName } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { CreateProjectModal } from "./CreateProjectModal";
import { toast } from "@/lib/toast";
import { DeleteCaseDialog } from "./DeleteCaseDialog";
import { InboxSheet, type Inbox } from "./InboxSheet";
import { SearchDialog } from "./SearchDialog";
import { cx } from "./ui";

export const PRODUCT = "Veyra";

interface Me {
  user: { name: string; email: string; username?: string | null };
  organisation: string;
}

interface CaseLite {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  reference?: string;
  summary?: string | null;
  pinned: boolean;
  archived?: boolean;
  busy?: boolean;
  project_id?: string | null;
}

interface ProjectLite {
  id: string;
  name: string;
  description: string;
  visibility?: "private" | "public";
}

// Drag a case onto another case to group them into a new project, or onto a project folder to add it.
const DRAG_TYPE = "application/x-veyra-case";

const NAV: [href: string, label: string, icon: IconName, match: (p: string) => boolean][] = [
  ["/cases", "Cases", "folder", (p) => p === "/cases"],
  ["/projects", "Projects", "projects", (p) => p.startsWith("/projects")],
  ["/vault", "Vault", "vault", (p) => p.startsWith("/vault")],
  ["/workflows", "Workflows", "workflow", (p) => p.startsWith("/workflows")],
];

// How the Recent list is organised, remembered on this device.
interface RecentPrefs {
  pinnedFirst: boolean;
  sort: "updated" | "created" | "name";
  showProjects: boolean;
  showArchived: boolean;
}
const RECENT_DEFAULT: RecentPrefs = { pinnedFirst: true, sort: "updated", showProjects: true, showArchived: false };
const RECENT_KEY = "veyra.sidebar.recent";

// Read through useSyncExternalStore: the server renders the defaults, the browser its saved choice.
const recentListeners = new Set<() => void>();
const subscribeRecent = (l: () => void) => {
  recentListeners.add(l);
  return () => {
    recentListeners.delete(l);
  };
};
const readRecentRaw = () => {
  try {
    return localStorage.getItem(RECENT_KEY) ?? "";
  } catch {
    return "";
  }
};
function parseRecentPrefs(raw: string): RecentPrefs {
  try {
    return { ...RECENT_DEFAULT, ...JSON.parse(raw || "{}") };
  } catch {
    return RECENT_DEFAULT;
  }
}

/** Pure: the Recent list in the chosen order. */
export function orderRecent<T extends { title: string; pinned: boolean; created_at?: string; updated_at?: string }>(cases: T[], prefs: Pick<RecentPrefs, "sort" | "pinnedFirst">): T[] {
  const key = (c: T) => (prefs.sort === "created" ? c.created_at ?? "" : c.updated_at ?? "");
  const sorted = [...cases].sort((a, b) =>
    prefs.sort === "name" ? a.title.replace(/^DEMO · /, "").localeCompare(b.title.replace(/^DEMO · /, "")) : key(b).localeCompare(key(a)),
  );
  return prefs.pinnedFirst ? [...sorted.filter((c) => c.pinned), ...sorted.filter((c) => !c.pinned)] : sorted;
}

function readCollapsed(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v ? v === "collapsed" : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Main navigation: New, Cases, Projects, Vault, Workflows, the recent
 * cases (each with a … menu) and the account menu behind the avatar.
 * Collapses to an icon rail; the choice is remembered per browser.
 */
export function Sidebar({
  activeCaseId,
  variant = "plain",
  storageKey = "veyra.sidebar",
  defaultCollapsed = false,
  autoCollapse = false,
  onExpand,
  floatBelow = 768,
}: {
  activeCaseId?: string;
  variant?: "plain" | "card" | "rail";
  /** Pages can remember their own width, e.g. the case workspace starts as a rail. */
  storageKey?: string;
  defaultCollapsed?: boolean;
  /** Collapse to the icon rail while true (e.g. a drawer is open); the saved preference returns after. */
  autoCollapse?: boolean;
  /** Called when someone expands the sidebar, so the page can close its drawer: only one of the two is open at a time. */
  onExpand?: () => void;
  /** Below this width the sidebar stays a rail and floats open over the page. Phones always; busy pages can raise it. */
  floatBelow?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useApi<Me>("/api/auth/me");
  const cases = useApi<{ cases: CaseLite[] }>("/api/cases", { pollMs: 5000 });
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // On a phone the sidebar stays a rail; expanding it floats the full sidebar over the page instead of squeezing it.
  const narrow = useNarrow(floatBelow);
  const [floating, setFloating] = useState(false);
  const [floatPath, setFloatPath] = useState(pathname);
  if (floatPath !== pathname) {
    setFloatPath(pathname);
    setFloating(false);
  }
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [newProject, setNewProject] = useState(false);
  const recentRaw = useSyncExternalStore(subscribeRecent, readRecentRaw, () => "");
  const recentPrefs = useMemo(() => parseRecentPrefs(recentRaw), [recentRaw]);
  const setRecent = (patch: Partial<RecentPrefs>) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify({ ...recentPrefs, ...patch }));
    } catch {
      // Storage unavailable: nothing to remember the choice in.
    }
    recentListeners.forEach((l) => l());
  };
  // The inbox sheet opens beside the sidebar, from its right edge
  const inbox = useApi<Inbox>("/api/inbox", { pollMs: 30000 });
  const [inboxAt, setInboxAt] = useState<number | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const edge = () => Math.round(asideRef.current?.getBoundingClientRect().right ?? 244);
  const toggleInbox = () => setInboxAt((at) => (at === null ? edge() : null));
  const unread = inbox.data?.unread ?? 0;
  const inboxSheet = inboxAt !== null && <InboxSheet left={inboxAt} inbox={inbox} onClose={() => setInboxAt(null)} />;

  const [searching, setSearching] = useState(false);
  const searchDialog = <SearchDialog open={searching} onClose={() => setSearching(false)} cases={cases.data?.cases ?? []} />;
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
  const [deleting, setDeleting] = useState<CaseLite | null>(null);
  const projects = useApi<{ projects: ProjectLite[] }>("/api/projects", { pollMs: 20000 });
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<ProjectLite | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore the remembered width after mount so server and client render the same markup first.
  useEffect(() => {
    const t = setTimeout(() => setCollapsed(autoCollapse || readCollapsed(storageKey, defaultCollapsed)), 0);
    return () => clearTimeout(t);
  }, [storageKey, defaultCollapsed, autoCollapse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remember = (c: boolean) => {
    try {
      localStorage.setItem(storageKey, c ? "collapsed" : "expanded");
    } catch {}
  };
  function expand() {
    if (narrow) return setFloating(true);
    remember(false);
    setCollapsed(false);
    onExpand?.();
  }
  const toggle = () => {
    if (narrow) return setFloating((f) => !f);
    if (collapsed) return expand();
    remember(true);
    setCollapsed(true);
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await cases.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const caseMenu = (c: CaseLite): MenuItem[] => [
    { label: c.pinned ? "Unpin" : "Pin", icon: "pin", onSelect: () => void act(() => api(`/api/cases/${c.id}`, { method: "PATCH", json: { pinned: !c.pinned } }), c.pinned ? "Unpinned" : "Pinned") },
    { label: "Rename", icon: "pencil", onSelect: () => setRenaming({ id: c.id, title: c.title }) },
    {
      label: "Branch",
      icon: "fork",
      onSelect: () =>
        void act(async () => {
          const r = await api<{ caseId: string }>(`/api/cases/${c.id}/fork`, { method: "POST" });
          router.push(`/cases/${r.caseId}`);
        }, "Branch created"),
    },
    { kind: "separator" },
    { label: "Open vault", icon: "vault", onSelect: () => router.push(`/vault/${c.id}`) },
    ...(c.project_id ? [{ label: "Remove from project", icon: "close" as const, onSelect: () => void act(async () => { await moveTo(c.id, null); await projects.reload(); }, "Removed from project") }] : []),
    { kind: "separator" },
    {
      label: "Archive",
      icon: "archive",
      onSelect: () =>
        void act(async () => {
          await api(`/api/cases/${c.id}`, { method: "PATCH", json: { archived: true } });
          toast("Case archived", { action: { label: "Undo", onClick: () => void api(`/api/cases/${c.id}`, { method: "PATCH", json: { archived: false } }).then(() => cases.reload()) } });
          if (c.id === activeCaseId) router.push("/cases");
        }),
    },
    { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(c) },
  ];

  const saveRename = async () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    const id = renaming.id;
    setRenaming(null);
    if (title) await act(() => api(`/api/cases/${id}`, { method: "PATCH", json: { title } }), "Case renamed");
  };

  const name = me.data?.user.name ?? "";
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const accountItems: MenuItem[] = [
    { kind: "header", label: me.data?.user.email && !me.data.user.email.endsWith("@local.invalid") ? me.data.user.email : me.data?.user.username ?? name },
    { label: "Settings", icon: "settings", shortcut: "⇧⌘,", onSelect: () => router.push("/settings?tab=account") },
    { label: "Usage", icon: "usage", onSelect: () => router.push("/settings?tab=usage") },
    { label: "Language", icon: "globe", submenu: true, onSelect: () => router.push("/settings?tab=general#language") },
    { label: "Get help", icon: "help", onSelect: () => router.push("/settings?tab=help") },
    { kind: "separator" },
    { label: "Get started", icon: "rocket", onSelect: () => router.push("/start") },
    { label: "Upgrade plan", icon: "upgrade", hint: "Soon", disabled: true, onSelect: () => {} },
    { label: "Learn more", icon: "info", submenu: true, onSelect: () => router.push("/settings?tab=help#about") },
    { kind: "separator" },
    {
      label: "Log out",
      icon: "logout",
      onSelect: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      },
    },
  ];

  // The workspace menu, opened from the mark at the top of the sidebar.
  const setTheme = (t: ThemeChoice) => {
    saveTheme(t);
    setThemeChoice(t);
  };
  const workspaceItems: MenuItem[] = [
    { label: "Settings", icon: "settings", onSelect: () => router.push("/settings?tab=general") },
    { label: "Invite and manage members", icon: "members", onSelect: () => router.push("/settings?tab=members") },
    {
      label: "Theme",
      icon: "sun",
      onSelect: () => {},
      items: [
        { label: "System", icon: "monitor", checked: themeChoice === "system", onSelect: () => setTheme("system") },
        { label: "Light", icon: "sun", checked: themeChoice === "light", onSelect: () => setTheme("light") },
        { label: "Dark", icon: "moon", checked: themeChoice === "dark", onSelect: () => setTheme("dark") },
      ],
    },
    { kind: "separator" },
    {
      label: "Log out",
      icon: "logout",
      onSelect: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      },
    },
  ];

  const list = orderRecent((cases.data?.cases ?? []).filter((c) => recentPrefs.showArchived || !c.archived), recentPrefs);
  const folders = recentPrefs.showProjects ? (projects.data?.projects ?? []).map((p) => ({ ...p, cases: list.filter((c) => c.project_id === p.id) })) : [];
  const loose = list.filter((c) => !c.project_id || !folders.some((f) => f.id === c.project_id));
  const recentMenu: MenuItem[] = [
    {
      label: "Organise sidebar",
      icon: "sidebar",
      onSelect: () => {},
      items: [
        { label: "Pinned first", checked: recentPrefs.pinnedFirst, onSelect: () => setRecent({ pinnedFirst: true }) },
        { label: "Pinned mixed in", checked: !recentPrefs.pinnedFirst, onSelect: () => setRecent({ pinnedFirst: false }) },
      ],
    },
    {
      label: "Sort cases by",
      icon: "sort",
      onSelect: () => {},
      items: [
        { label: "Last updated", checked: recentPrefs.sort === "updated", onSelect: () => setRecent({ sort: "updated" }) },
        { label: "Date created", checked: recentPrefs.sort === "created", onSelect: () => setRecent({ sort: "created" }) },
        { label: "Name", checked: recentPrefs.sort === "name", onSelect: () => setRecent({ sort: "name" }) },
      ],
    },
    { kind: "separator" },
    { kind: "header", label: "Show" },
    { label: "Projects", checked: recentPrefs.showProjects, onSelect: () => setRecent({ showProjects: !recentPrefs.showProjects }) },
    { label: "Archived cases", checked: recentPrefs.showArchived, onSelect: () => setRecent({ showArchived: !recentPrefs.showArchived }) },
  ];

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setDropTarget(null),
  });
  const dropProps = (key: string, onDrop: (dragged: string) => Promise<unknown>) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      const dragged = e.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (!dragged) return;
      e.preventDefault();
      void act(async () => {
        await onDrop(dragged);
        await projects.reload();
      });
    },
  });
  const moveTo = (caseId: string, projectId: string | null) => api(`/api/cases/${caseId}`, { method: "PATCH", json: { project_id: projectId } });
  const dropOnCase = (target: CaseLite) => async (dragged: string) => {
    if (dragged === target.id) return;
    if (target.project_id) return moveTo(dragged, target.project_id);
    const r = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: { name: "Untitled project", caseIds: [target.id, dragged] } });
    setOpenFolders((s) => new Set(s).add(r.project.id));
  };

  const caseRow = (c: CaseLite) => {
    const open = c.id === activeCaseId;
    if (renaming?.id === c.id)
      return (
        <input
          key={c.id}
          autoFocus
          value={renaming.title}
          aria-label="Case name"
          onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
          onBlur={() => void saveRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveRename();
            if (e.key === "Escape") setRenaming(null);
          }}
          className="w-full rounded-md border border-accent bg-panel px-2 py-1 text-[13px] outline-none ring-2 ring-accent/15"
        />
      );
    return (
      <div
        key={c.id}
        {...dropProps(`c:${c.id}`, dropOnCase(c))}
        className={cx("group relative flex items-center rounded-md", dropTarget === `c:${c.id}` ? "bg-hover ring-1 ring-line-strong" : open ? "bg-hover" : "hover:bg-hover")}
      >
        <Link {...dragProps(c.id)} href={`/cases/${c.id}`} aria-current={open ? "page" : undefined} className={cx("flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 pr-8", open ? "font-medium text-ink" : "text-muted group-hover:text-ink")}>
          {c.pinned && <Icon name="pin" size={12} className="shrink-0 text-faint" />}
          <span className="truncate">{c.title.replace(/^DEMO · /, "")}</span>
          {c.busy && <BusyDot />}
        </Link>
        <Menu
          items={caseMenu(c)}
          align="left"
          width={200}
          trigger={({ open: menuOpen, toggle: t, ref }) => (
            <button
              ref={ref}
              onClick={t}
              aria-label={`More options for ${c.title.replace(/^DEMO · /, "")}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cx("absolute right-1 grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-line hover:text-ink focus:opacity-100", menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
            >
              <Icon name="moreH" size={15} />
            </button>
          )}
        />
      </div>
    );
  };

  // Collapsed: a slim rail of icons. Recent cases are only listed when expanded.
  // `overlays`: whether this copy of the rail owns the sheets and dialogs (only one copy may).
  const railView = (overlays: boolean, extra = "") => (
      <aside ref={overlays ? asideRef : undefined} aria-label="Main navigation" className={cx("flex w-[56px] shrink-0 flex-col items-center gap-1 bg-background-secondary-default py-3", extra)}>
        <button onClick={toggle} title="Expand sidebar" aria-label="Expand sidebar" className="group mb-2 grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
          <LogoMark size={22} className="text-ink group-hover:hidden group-focus-visible:hidden" />
          <Icon name="sidebar" size={17} className="hidden text-muted group-hover:block group-focus-visible:block" />
        </button>
        <button
          onClick={() => setSearching(true)}
          title="Search"
          aria-label="Search"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
        >
          <Icon name="search" size={17} />
        </button>
        <NavItem href="/?new=1" label="New" icon="plus" collapsed strong />
        <button
          data-inbox-toggle
          onClick={toggleInbox}
          aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
          aria-expanded={inboxAt !== null}
          className={cx("relative grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink", inboxAt !== null && "bg-hover text-ink")}
        >
          <Icon name="inbox" size={17} />
          {unread > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#d9822b]" />}
        </button>

        {NAV.map(([href, label, icon, match]) => (
          <NavItem key={href} href={href} label={label} icon={icon} collapsed active={match(pathname)} />
        ))}
        <div className="flex-1" />
        <Menu
          items={accountItems}
          side="top"
          width={260}
          trigger={({ open, toggle: t, ref }) => (
            <button ref={ref} onClick={t} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={name} className={cx("grid h-9 w-9 place-items-center rounded-lg hover:bg-hover", open && "bg-hover")}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#d9822b] text-[11px] font-semibold text-white">{initials}</span>
            </button>
          )}
        />
        {/* While the full sidebar floats on a phone, it owns these, so they aren't opened twice. */}
        {overlays && (
          <>
            {newProject && <CreateProjectModal onClose={() => setNewProject(false)} />}
            {inboxSheet}
            {searchDialog}
          </>
        )}
      </aside>
    );
  if ((collapsed && !narrow) || (narrow && !floating)) return railView(true);

  const full = (
    <aside
      ref={asideRef}
      aria-label="Main navigation"
      className={cx(
        "flex shrink-0 flex-col py-3",
        "w-[244px] px-3",
        variant === "card" && "rounded-2xl bg-panel shadow-[var(--shadow-card)]",
        variant === "rail" && "bg-background-secondary-default",
      )}
    >
      <div className="flex items-center gap-2 px-1.5 pb-3 pt-0.5">
        <Menu
          items={workspaceItems}
          width={240}
          trigger={({ open, toggle: t, ref }) => (
            <button
              ref={ref}
              onClick={() => {
                setThemeChoice(readTheme());
                t();
              }}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`${PRODUCT} menu`}
              className={cx("-ml-1 flex h-8 items-center gap-1 rounded-lg pl-1 pr-1.5 hover:bg-hover", open && "bg-hover")}
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-subtle">
                <LogoMark size={16} className="text-ink" />
              </span>
              <Icon name="chevron" size={13} className="rotate-90 text-faint" />
            </button>
          )}
        />
        <button onClick={toggle} title="Collapse sidebar" aria-label="Collapse sidebar" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-hover hover:text-ink">
          <Icon name="sidebar" size={16} />
        </button>
      </div>

      <button
        onClick={() => setSearching(true)}
        aria-haspopup="dialog"
        className="mb-2 flex h-8 w-full items-center gap-2 rounded-lg bg-subtle px-2.5 text-[14px] text-muted hover:bg-hover hover:text-ink"
      >
        <Icon name="search" size={15} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="shrink-0 font-sans text-[11px] text-faint">⌘K</kbd>
      </button>

      <nav className="space-y-0.5 text-[14px]">
        <NavItem href="/?new=1" label="New" icon="plus" collapsed={false} strong />
        <button
          data-inbox-toggle
          onClick={toggleInbox}
          aria-expanded={inboxAt !== null}
          className={cx("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-[13.5px] text-ink hover:bg-hover", inboxAt !== null && "bg-hover font-medium")}
        >
          <Icon name="inbox" size={17} className={inboxAt !== null ? "text-ink" : "text-muted"} />
          Inbox
          {unread > 0 && <span className="ml-auto rounded-md bg-[#fcebd6] px-1.5 text-[11px] font-medium tabular-nums text-[#8a4a10]">{unread}</span>}
        </button>

        {NAV.map(([href, label, icon, match]) =>
          href === "/projects" ? (
            <div key={href} className="group/nav relative">
              <NavItem href={href} label={label} icon={icon} collapsed={false} active={match(pathname)} />
              <button
                onClick={() => setNewProject(true)}
                title="New project"
                aria-label="New project"
                className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-muted opacity-0 hover:bg-line hover:text-ink focus:opacity-100 group-hover/nav:opacity-100"
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
          ) : (
            <NavItem key={href} href={href} label={label} icon={icon} collapsed={false} active={match(pathname)} />
          ),
        )}
      </nav>

      <div
        {...dropProps("recent", (dragged) => moveTo(dragged, null))}
        className={cx("group/recent mt-7 flex items-center rounded-md pl-2", dropTarget === "recent" && "bg-hover ring-1 ring-line-strong")}
      >
        <p className="flex-1 pb-1.5 pt-1 text-[12px] text-muted">Recent</p>
        <Menu
          align="left"
          width={220}
          items={recentMenu}
          trigger={({ toggle, ref, open }) => (
            <button ref={ref} onClick={toggle} aria-label="Recent list options" aria-expanded={open} className={cx("grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-line hover:text-ink", open && "bg-line text-ink")}>
              <Icon name="moreH" size={15} />
            </button>
          )}
        />
      </div>
      <div className="scroll-panel min-h-0 flex-1 space-y-0.5 text-[14px]">
        {folders.map((f) => {
          const hasActive = f.cases.some((c) => c.id === activeCaseId);
          const isOpen = openFolders.has(f.id) || hasActive;
          return (
            <div key={f.id}>
              <div
                {...dropProps(`p:${f.id}`, (dragged) => moveTo(dragged, f.id))}
                className={cx("group relative flex items-center rounded-md", dropTarget === `p:${f.id}` ? "bg-hover ring-1 ring-line-strong" : "hover:bg-hover")}
              >
                <button
                  onClick={() =>
                    setOpenFolders((s) => {
                      const n = new Set(s);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    })
                  }
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 pr-8 text-left text-ink group-hover:text-ink"
                >
                  <Icon name="folder" size={15} className="shrink-0 text-muted" />
                  <span className="truncate">{f.name}</span>
                  {f.visibility === "private" && <Icon name="lock" size={12} className="shrink-0 text-faint" />}
                  <span className="shrink-0 text-[11px] text-faint">{f.cases.length}</span>
                </button>
                <Menu
                  align="left"
                  width={200}
                  items={[
                    { label: "Edit", icon: "pencil", onSelect: () => setEditProject(f) },
                    { label: "Open project", icon: "projects", onSelect: () => router.push(`/projects/${f.id}`) },
                    { kind: "separator" },
                    {
                      label: "Ungroup",
                      icon: "close",
                      onSelect: () =>
                        void act(async () => {
                          await api(`/api/projects/${f.id}`, { method: "DELETE" });
                          await projects.reload();
                        }, "Project ungrouped"),
                    },
                  ]}
                  trigger={({ open: menuOpen, toggle: t, ref }) => (
                    <button
                      ref={ref}
                      onClick={t}
                      aria-label={`More options for ${f.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className={cx("absolute right-1 grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-line hover:text-ink focus:opacity-100", menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                    >
                      <Icon name="moreH" size={15} />
                    </button>
                  )}
                />
              </div>
              {isOpen && <div className="ml-3 space-y-0.5 border-l border-line pl-1.5">{f.cases.map((c) => caseRow(c))}</div>}
            </div>
          );
        })}
        {loose.slice(0, 30).map((c) => caseRow(c))}
        {cases.data && list.length === 0 && <p className="px-2 py-1 text-[12px] text-faint">No cases yet</p>}
      </div>
      {error && <p role="alert" className="px-2 pt-2 text-[12px] text-danger">{error}</p>}

      <Menu
        items={accountItems}
        side="top"
        width={260}
        trigger={({ open, toggle: t, ref }) => (
          <button
            ref={ref}
            onClick={t}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Account menu"
            className={cx("mt-3 flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-hover", open && "bg-hover")}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d9822b] text-[11px] font-semibold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{name}</span>
              <span className="block truncate text-[11px] text-faint">{me.data?.organisation ?? ""}</span>
            </span>
          </button>
        )}
      />
      {newProject && <CreateProjectModal onClose={() => setNewProject(false)} />}
      {inboxSheet}
      {searchDialog}
      {deleting && (
        <DeleteCaseDialog
          caseId={deleting.id}
          reference={deleting.reference ?? ""}
          title={deleting.title.replace(/^DEMO · /, "")}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            const wasOpen = deleting.id === activeCaseId;
            setDeleting(null);
            void cases.reload();
            if (wasOpen) router.push("/cases");
          }}
        />
      )}
      {editProject && <CreateProjectModal project={editProject} onClose={() => setEditProject(null)} onSaved={() => void projects.reload()} />}
    </aside>
  );
  // Before the width is known (the first paint, before scripts load) CSS picks the layout, so a slow
  // phone never flashes the full desktop sidebar.
  if (!narrow) {
    const [hideFull, showRail] = floatBelow >= 1280 ? ["max-xl:hidden", "xl:hidden"] : ["max-md:hidden", "md:hidden"];
    return (
      <>
        <div className={cx("contents", hideFull)}>{full}</div>
        {railView(false, showRail)}
      </>
    );
  }
  // Phone: the rail stays in place and the full sidebar floats over the page, closing on a tap outside.
  return (
    <>
      {railView(false)}
      {createPortal(
        <div className="fixed inset-0 z-40 flex">
          <div className="animate-pop flex h-full max-w-[85vw] bg-background-secondary-default shadow-[var(--shadow-dialog)]" style={{ transformOrigin: "left center" }}>
            {full}
          </div>
          <button aria-label="Close menu" onClick={() => setFloating(false)} className="flex-1 bg-overlay" />
        </div>,
        document.body,
      )}
    </>
  );
}

/** Pulsing dot: Veyra is processing something on this case. */
function BusyDot() {
  return (
    <span className="relative ml-auto flex h-2 w-2 shrink-0" title="Veyra is working on this case" aria-label="Veyra is working on this case" role="status">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

function NavItem({ href, label, icon, active, collapsed, strong }: { href: string; label: string; icon: IconName; active?: boolean; collapsed: boolean; strong?: boolean }) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center rounded-md text-[13.5px]",
        collapsed ? "h-8 w-8 justify-center" : "gap-3 px-2 py-1.5",
        active ? "bg-hover font-medium text-ink" : "text-ink hover:bg-hover hover:text-ink",
      )}
    >
      {strong ? (
        <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-neutral-600 text-white">
          <Icon name="plus" size={12} />
        </span>
      ) : (
        <Icon name={icon} size={17} className={active ? "text-ink" : "text-muted"} />
      )}
      {!collapsed && label}
    </Link>
  );
}

/** True below the given width, where the sidebar floats instead of taking space. */
function useNarrow(below: number) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${below - 1}px)`);
    const set = () => setNarrow(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, [below]);
  return narrow;
}
