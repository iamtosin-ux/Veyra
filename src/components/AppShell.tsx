"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { cx } from "./ui";

/** Workspace frame: the sidebar, and a main card with a breadcrumb bar. */
/** `drawerOpen` collapses the sidebar while a right-hand drawer is showing; expanding the sidebar calls `onSidebarExpand` so the page can close it. */
export function AppShell({ breadcrumb, actions, children, drawerOpen, onSidebarExpand }: { breadcrumb: ReactNode; actions?: ReactNode; children: ReactNode; drawerOpen?: boolean; onSidebarExpand?: () => void }) {
  return (
    <div className="flex h-screen bg-background-secondary-default">
      <Sidebar variant="rail" autoCollapse={drawerOpen} onExpand={onSidebarExpand} />
      <div className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 bg-panel px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">{breadcrumb}</div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function Crumb({ children, href, current }: { children: ReactNode; href?: string; current?: boolean }) {
  // The page you're on gives way first; the trail before it keeps a readable width.
  const cls = cx("truncate", current ? "min-w-0 font-medium text-ink" : "max-w-[8rem] shrink-0 text-muted");
  return (
    <>
      {href ? <Link href={href} className={cx(cls, "hover:text-ink")}>{children}</Link> : <span className={cls}>{children}</span>}
      {!current && <span className="shrink-0 text-faint">/</span>}
    </>
  );
}

export function PillButton({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[12px] font-medium text-ink hover:bg-subtle">
      {children}
    </button>
  );
}
