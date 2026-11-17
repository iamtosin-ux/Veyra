"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CaseStatus } from "@/lib/types";
import { Icon } from "./Icon";

export interface CaseItem {
  id: string;
  reference: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  status: CaseStatus;
  evidence_count: number;
  findings_count: number;
  findings_needing_review: number;
  is_demo: boolean;
  pinned: boolean;
  archived?: boolean;
  industry: string | null;
  project_id: string | null;
  summary?: string | null;
  summary_source?: string | null;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Pure: "28 Oct" this year, "28 Oct 2025" otherwise. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${d.getFullYear()}`;
}

/**
 * A case as a document preview: the case file's first page in a tinted frame,
 * then its name and when it last changed.
 */
export function CasePreviewCard({
  c,
  action,
}: {
  c: CaseItem;
  action?: ReactNode;
}) {
  const title = c.title.replace(/^DEMO · /, "");
  const summary =
    c.summary || c.description.split(/\n\nDemonstration case built/)[0];
  return (
    <div className="group relative">
      <Link
        href={`/cases/${c.id}`}
        className="block rounded-3xl border border-border-button-default bg-background-primary-default p-1.5 shadow-xs transition-colors hover:border-border-button-hover"
      >
        <div
          aria-hidden
          // Concentric with the card: its corner less the 1px border and 6px padding.
          className="relative h-[124px] overflow-hidden rounded-[calc(var(--radius-3xl)-7px)] bg-background-secondary-default"
        >
          <div className="absolute left-[10%] right-[6%] top-4 h-full rounded-lg bg-panel/70 shadow-[0_1px_2px_rgb(0_0_0/0.06)]" />
          <div className="absolute left-[8%] right-[8%] top-5 h-full rounded-lg bg-panel px-3.5 pt-3 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.12)]">
            <p className="line-clamp-3 font-heading text-[14px] font-medium leading-[1.15] text-ink">
              {title}
            </p>
            <p className="mt-1.5 text-[8px] text-faint">
              {shortDate(c.updated_at)} · {c.reference}
            </p>
            {summary && (
              <>
                <p className="mt-2.5 text-[9px] font-medium text-muted">
                  Summary
                </p>
                <p className="mt-0.5 line-clamp-2 text-[8px] leading-snug text-faint">
                  {summary}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="px-1.5 pb-1 pt-2.5">
          <p className="truncate text-[14px] font-medium">{title}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {shortDate(c.updated_at)}
          </p>
        </div>
      </Link>
      {action && (
        <div className="absolute right-3 top-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {action}
        </div>
      )}
    </div>
  );
}

/** The same case as a single list row. Hovering swaps the counts for an arrow. */
export function CaseRow({ c }: { c: CaseItem }) {
  const summary =
    c.summary || c.description.split(/\n\nDemonstration case built/)[0];
  return (
    <Link
      href={`/cases/${c.id}`}
      className="group flex items-center gap-6 py-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">
          {c.title.replace(/^DEMO · /, "")}
        </span>
        <span className="mt-1 block truncate text-[13px] text-muted">
          {summary || "No summary yet."}
        </span>
      </span>
      <span className="shrink-0 text-[12px] text-faint group-hover:hidden group-focus-visible:hidden">
        {c.evidence_count} evidence · {c.findings_count} finding
        {c.findings_count === 1 ? "" : "s"}
      </span>
      <Icon
        name="arrowRight"
        size={18}
        className="hidden shrink-0 text-ink group-hover:block group-focus-visible:block"
      />
    </Link>
  );
}
