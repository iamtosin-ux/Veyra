"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { dismissToast, getServerToasts, getToasts, subscribeToasts, type ToastItem } from "@/lib/toast";
import { Icon } from "./Icon";
import { cx } from "./ui";

const LIFETIME = 5500;

/** Confirmation toasts for important actions, stacked at the bottom centre. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  return (
    <section aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-[80] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} />
      ))}
    </section>
  );
}

function Toast({ t }: { t: ToastItem }) {
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(LIFETIME);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setLeaving(true);
    setTimeout(() => dismissToast(t.id), 200);
  };

  // Count down only while visible: pause on hover and while the tab is hidden.
  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current -= Date.now() - started.current;
  };
  const resume = () => {
    if (timer.current) return;
    started.current = Date.now();
    timer.current = setTimeout(close, Math.max(600, remaining.current));
  };

  useEffect(() => {
    resume();
    const onVis = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      // Clear the handle too, so a remount (React runs effects twice in development) starts the countdown again.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={cx(
        "pointer-events-auto flex min-h-12 max-w-[440px] items-center gap-2.5 rounded-2xl border border-border-button-default bg-background-primary-default py-2 pl-3.5 pr-2 text-body-medium text-text-primary shadow-lg",
        // Enter from below with a soft ease (@starting-style); leave faster than it arrived.
        leaving
          ? "translate-y-2 opacity-0 transition-[translate,opacity] duration-200 ease-out"
          : "translate-y-0 opacity-100 transition-[translate,opacity] duration-[400ms] ease-[ease] starting:translate-y-full starting:opacity-0",
      )}
    >
      <Icon name={t.tone === "danger" ? "trash" : "check"} size={15} className="shrink-0 text-ink" />
      <span className="min-w-0 flex-1">{t.message}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action?.onClick();
            close();
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-body-medium text-accent-600 hover:bg-background-primary-hover"
        >
          {t.action.label}
        </button>
      )}
      <button onClick={close} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-foreground-icon-secondary hover:bg-background-primary-hover hover:text-foreground-icon-primary">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
