"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Anchored panel for small forms. Closes on outside click or Esc. */
export function Popover({
  trigger,
  children,
  align = "right",
  side = "bottom",
  width = 320,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLButtonElement | null) => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; vh: number } | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchor?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor]);

  const toggle = () => {
    const r = anchor?.getBoundingClientRect();
    if (r) {
      const x = align === "right" ? r.right - width : r.left;
      setPos({ x: Math.max(8, Math.min(x, window.innerWidth - width - 8)), y: side === "bottom" ? r.bottom + 6 : r.top - 6, vh: window.innerHeight });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      {trigger({ open, toggle, ref: setAnchor })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            className="animate-pop fixed z-[60] rounded-2xl border border-line bg-panel shadow-[var(--shadow-dialog)]"
            style={{ transformOrigin: `${side === "bottom" ? "top" : "bottom"} ${align}`, left: pos.x, width, ...(side === "bottom" ? { top: pos.y } : { bottom: pos.vh - pos.y }) }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}
