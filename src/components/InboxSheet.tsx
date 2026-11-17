"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { LogoMark } from "./Logo";
import { Icon } from "./Icon";
import { shortDate } from "./CaseCard";
import { cx } from "./ui";

export interface InboxItem {
  id: string;
  kind: "review" | "shared" | "owner" | "evidence" | "analysis" | "task";
  actor: string | null;
  verb: string;
  object: string | null;
  case_id: string;
  case_title: string;
  snippet: string | null;
  at: string;
  unread: boolean;
  target: { view?: string; section?: string };
  /** Present only when the item is waiting on the user. */
  action?: string;
}

export interface Inbox {
  items: InboxItem[];
  unread: number;
}

const DAY = 86_400_000;

/** Pure: which heading an item sits under. */
export function inboxGroup(iso: string, now = new Date()): "Today" | "This week" | "Older" {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= start) return "Today";
  if (t >= start - 6 * DAY) return "This week";
  return "Older";
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/**
 * The inbox, a sheet beside the sidebar: review requests, cases shared with
 * you, evidence contributors sent in, and analysis that finished. Closing it
 * marks what was there as read.
 */
export function InboxSheet({ left, inbox, onClose }: { left: number; inbox: ReturnType<typeof useApi<Inbox>>; onClose: () => void }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const items = inbox.data?.items ?? [];

  const markRead = async () => {
    await api("/api/inbox", { method: "POST" });
    await inbox.reload();
  };
  const close = () => {
    if (inbox.data?.unread) void markRead();
    onClose();
  };

  // Esc or a click outside the sheet (and its sidebar button) closes it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!panel.current?.contains(t) && !t.closest("[data-inbox-toggle]")) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  });

  const open = (i: InboxItem) => {
    const q = new URLSearchParams();
    if (i.target.view) q.set("view", i.target.view);
    if (i.target.section) q.set("section", i.target.section);
    router.push(`/cases/${i.case_id}${q.size ? `?${q}` : ""}`);
    close();
  };

  const groups = (["Today", "This week", "Older"] as const).map((g) => ({ g, list: items.filter((i) => inboxGroup(i.at) === g) })).filter((x) => x.list.length);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Inbox"
      className="animate-pop fixed bottom-0 top-0 z-40 flex w-[380px] max-w-[calc(100vw-56px)] flex-col border-r border-line bg-panel shadow-[var(--shadow-dialog)]"
      style={{ left, transformOrigin: "left center" }}
    >
      <div className="flex shrink-0 items-center gap-1 px-5 pb-2 pt-4">
        <p className="flex-1 text-[15px] font-medium">Inbox</p>
        <button
          onClick={() => void markRead()}
          disabled={!inbox.data?.unread}
          aria-label="Mark all as read"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:text-faint disabled:hover:bg-transparent"
        >
          <Icon name="checkDouble" size={17} />
        </button>
        <button onClick={close} aria-label="Close inbox" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <Icon name="back" size={17} />
        </button>
      </div>

      <div className="scroll-panel min-h-0 flex-1 px-3 pb-4">
        {!inbox.data ? (
          <p className="px-2 py-3 text-[13px] text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-muted">Nothing here yet.</p>
        ) : (
          groups.map(({ g, list }) => (
            <section key={g}>
              <p className="px-2 pb-1 pt-3 text-[12px] font-medium text-muted">{g}</p>
              <ul>
                {list.map((i) => (
                  <li key={i.id} className="relative">
                    <button onClick={() => open(i)} className={cx("relative flex w-full gap-3 rounded-xl px-2 py-3 text-left hover:bg-subtle")}>
                      {i.unread && <span aria-label="Unread" className="absolute left-0 top-[22px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#d9822b]" />}
                      {i.actor ? (
                        <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white", i.kind === "evidence" ? "bg-[#2f6fa3]" : "bg-[#d9822b]")}>
                          {initials(i.actor)}
                        </span>
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-ink">
                          <LogoMark size={16} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-3">
                          <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
                            <span className="font-medium">{i.actor ?? "Veyra"}</span> <span className="text-muted">{i.verb}</span>{" "}
                            {i.object && (
                              <>
                                <span className="font-medium">{i.object}</span> <span className="text-muted">in</span>{" "}
                              </>
                            )}
                            <span className="font-medium">{i.case_title}</span>
                          </span>
                          <span className="shrink-0 pt-px text-[12px] text-faint">{shortDate(i.at)}</span>
                        </span>
                        {i.snippet && <span className="mt-1 line-clamp-3 block text-[13px] leading-relaxed text-muted">{i.kind === "review" ? `“${i.snippet}”` : i.snippet}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
