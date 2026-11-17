"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { formatTimestamp } from "@/lib/types";
import { cx } from "./ui";

export interface AnnotateAt {
  start: number;
  end: number | null;
  /** Where on screen the pick was made; the popup opens just above it. */
  x: number;
  y: number;
}

const WIDTH = 360;

/** Popup for annotating the moment or range picked on a timeline: one line to type, the button beside it. */
export function InlineAnnotate({ evidenceId, at, onClose, onAdded }: { evidenceId: string; at: AnnotateAt; onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Wait a tick so the pointer-up that opened the popup doesn't close it.
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/evidence/${evidenceId}/annotations`, {
        method: "POST",
        json: { start: Math.round(at.start * 10) / 10, end: at.end != null ? Math.round(at.end * 10) / 10 : null, description: text },
      });
      toast("Annotation added");
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the annotation");
      setBusy(false);
    }
  };

  const left = Math.max(12, Math.min(at.x - WIDTH / 2, window.innerWidth - WIDTH - 12));
  const above = at.y > 140;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Add annotation"
      className="animate-pop fixed z-[60] rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-dialog)]"
      style={{ transformOrigin: `${at.x - left}px ${above ? "bottom" : "top"}`, left, width: WIDTH, ...(above ? { bottom: window.innerHeight - at.y + 10 } : { top: at.y + 14 }) }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <span className="shrink-0 rounded-lg bg-[#fcebd6] px-2 py-1 tabular-nums text-[11px] font-medium text-[#8a4a10]">
          {formatTimestamp(at.start)}
          {at.end != null ? `–${formatTimestamp(at.end)}` : ""}
        </span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Keep typing (Space, arrows) away from the player; Escape closes only this popup.
            e.stopPropagation();
            if (e.key === "Escape") onClose();
          }}
          placeholder="What happens here?"
          aria-label="Annotation"
          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <button disabled={busy || !text.trim()} className={cx("h-8 shrink-0 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-40")}>
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="px-2 pb-1 pt-1.5 text-[12px] text-danger">{error}</p>}
    </div>,
    document.body,
  );
}
