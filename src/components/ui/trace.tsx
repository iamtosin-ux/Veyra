"use client";

import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Reveal, SLIDE, cx } from "../ui";

// Trace: lines of agent activity, after shadcn/ui's Trace (base-rhea), ported onto
// Veyra's tokens and its Reveal slide instead of Base UI's Collapsible. A line can
// be running (shimmering title), an error, or pending; a collapsible line opens to
// a nested Trace of what happened inside it, as a subagent run does.

export function Trace({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="trace" className={cx("flex w-full min-w-0 flex-col gap-2", className)} {...props} />;
}

export function TraceLine({ className, status, ...props }: ComponentProps<"span"> & { status?: "running" | "error" | "pending" }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cx(
        "flex w-fit max-w-full min-w-0 items-center gap-2 text-[13px] leading-5 text-muted",
        status === "error" && "text-danger",
        status === "pending" && "opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function TraceIcon({ className, ...props }: ComponentProps<"span">) {
  // As tall as a line of text, so it sits on the first line when a title wraps.
  return <span data-slot="trace-icon" aria-hidden="true" className={cx("flex h-5 w-4 shrink-0 items-center justify-center", className)} {...props} />;
}

export function TraceTitle({ className, wrap, ...props }: ComponentProps<"span"> & { wrap?: boolean }) {
  // A running line's title shimmers (styled in globals.css with .shimmer-text); reduced motion keeps it still.
  // Titles truncate on one line; `wrap` lets a step's full text show in a narrow column.
  return <span data-slot="trace-title" className={cx("min-w-0", wrap ? "[overflow-wrap:anywhere]" : "truncate", className)} {...props} />;
}

export function TraceDescription({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="trace-description" className={cx("shrink-0 tabular-nums text-faint", className)} {...props} />;
}

const Ctx = createContext<{ open: boolean; toggle: () => void; id: string; animate: boolean } | null>(null);

/** A line that opens to more. Uncontrolled by default; pass open and onOpenChange to control it. */
export function TraceCollapsible({
  className,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  children,
}: {
  className?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  // Only a click animates; opening on mount (a running subagent) shows at once.
  const [animate, setAnimate] = useState(false);
  const open = controlled ?? own;
  const id = useId();
  const toggle = () => {
    setAnimate(true);
    if (controlled === undefined) setOwn(!open);
    onOpenChange?.(!open);
  };
  return (
    <Ctx.Provider value={{ open, toggle, id, animate }}>
      <div data-slot="trace-collapsible" className={cx("flex w-full min-w-0 flex-col", className)}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function TraceCollapsibleTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const c = useContext(Ctx)!;
  return (
    <button
      type="button"
      data-slot="trace-collapsible-trigger"
      aria-expanded={c.open}
      aria-controls={c.id}
      onClick={c.toggle}
      className={cx(
        "-mx-1 flex w-fit max-w-full min-w-0 items-center gap-1 rounded-lg px-1 text-left text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      {children}
      <TraceIcon className={cx("-ml-0.5", c.animate && `transition-transform ${SLIDE}`, c.open && "rotate-90")}>
        <Icon name="chevron" size={16} />
      </TraceIcon>
    </button>
  );
}

export function TraceCollapsibleContent({ className, children }: { className?: string; children: ReactNode }) {
  const c = useContext(Ctx)!;
  return (
    <div id={c.id} data-slot="trace-collapsible-content">
      <Reveal open={c.open} instant={!c.animate}>
        {/* The rule down the left ties what happened inside to the line above it. */}
        <div className={cx("mb-1 ml-[7px] mt-2 min-w-0 border-l border-line pl-4 pr-1 leading-relaxed text-muted [overflow-wrap:anywhere]", className)}>{children}</div>
      </Reveal>
    </div>
  );
}

/** A small label for details such as a model or a tool, after shadcn/ui's Badge. */
export function Badge({ className, variant = "secondary", ...props }: ComponentProps<"span"> & { variant?: "secondary" | "outline" | "danger" }) {
  return (
    <span
      data-slot="badge"
      className={cx(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium",
        variant === "secondary" && "bg-subtle text-ink",
        variant === "outline" && "border border-line text-ink",
        variant === "danger" && "bg-danger-soft text-danger",
        className,
      )}
      {...props}
    />
  );
}
