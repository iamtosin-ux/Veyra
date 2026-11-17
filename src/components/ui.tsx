"use client";

import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { CaseStatus, ReviewStatus } from "@/lib/types";
import { Button as BoardButton } from "@/components/base/buttons/button";
import { CASE_STATUS_LABEL } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  // BoardUI's Button, so every shared button in the app is the design system's own.
  return (
    <BoardButton {...props} variant={variant} size={size === "sm" ? "small" : "medium"} className={className}>
      {children}
    </BoardButton>
  );
}

export function Chip({ tone = "neutral", children, title }: { tone?: "neutral" | "draft" | "ok" | "info" | "danger" | "accent"; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        // Plain text, not a pill: colour only where it carries meaning (a failure, a warning).
        "inline-flex items-center gap-1 whitespace-nowrap text-[12px] leading-4",
        tone === "danger" ? "text-danger" : tone === "draft" ? "text-draft" : "text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Who wrote unreviewed drafts in the current case: the AI, or a hand-written demo. */
export const DraftSourceContext = createContext<"ai" | "demo">("ai");
export function useDraftLabel(): string {
  return useContext(DraftSourceContext) === "demo" ? "Demo draft" : "AI draft";
}

/** Shown only once a reviewer has acted; unreviewed drafts carry no badge. */
export function ReviewChip({ status }: { status: ReviewStatus | string }) {
  if (status === "accepted") return <Chip tone="ok">Accepted</Chip>;
  if (status === "corrected") return <Chip tone="info">Corrected</Chip>;
  if (status === "rejected") return <Chip tone="danger">Rejected</Chip>;
  return null;
}

export function CaseStatusChip({ status }: { status: CaseStatus }) {
  const tone = { created: "neutral", evidence_uploaded: "neutral", analysis_in_progress: "info", ready_for_review: "draft", reviewed: "ok", error: "danger" } as const;
  return <Chip tone={tone[status]}>{CASE_STATUS_LABEL[status]}</Chip>;
}

export function ProcessingChip({ status }: { status: string }) {
  if (status === "processed") return <Chip tone="ok">Processed</Chip>;
  if (status === "failed") return <Chip tone="danger">Failed</Chip>;
  if (status === "queued" || status === "processing") return <Chip tone="info">{status === "queued" ? "Queued" : "Processing…"}</Chip>;
  return <Chip>Not analysed</Chip>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-display text-[15px] font-medium text-ink">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{children}</div>;
}

export function Notice({ tone = "draft", children }: { tone?: "draft" | "info"; children: ReactNode }) {
  return (
    <div className={cx("rounded-md px-3 py-2 text-sm", tone === "draft" ? "border border-draft/20 bg-draft-soft text-draft" : "border border-info/20 bg-info-soft text-info")}>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

// Pajamas form control: white field, neutral border that darkens on hover and focus, blue focus ring.
export const inputCls =
  "w-full rounded-lg border border-[var(--gl-control-border-color-default)] bg-[var(--gl-control-background-color-default)] px-3 py-2 text-body-regular text-text-primary placeholder:text-[var(--gl-control-placeholder-color)] outline-none transition-[border-color,box-shadow] hover:border-[var(--gl-control-border-color-hover)] focus:border-[var(--gl-control-border-color-focus)] focus:ring-2 focus:ring-[var(--gl-focus-ring-outer-color)] focus:ring-offset-1";

/** The one curve for things that open and close, so height and chevron move together without a jolt. */
export const SLIDE = "duration-[240ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none";

/**
 * Slides content open and closed by animating its height; closed content can't be focused.
 * `instant` applies a change without motion, for state restored on load rather than a click.
 */
export function Reveal({ open, instant, children }: { open: boolean; instant?: boolean; children: ReactNode }) {
  return (
    <div
      inert={!open}
      className={cx(
        "grid motion-reduce:transition-none",
        instant ? "transition-none" : `transition-[grid-template-rows,opacity] ${SLIDE}`,
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
