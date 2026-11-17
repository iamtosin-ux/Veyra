"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

export type MenuItem =
  | { kind?: "item"; label: string; icon?: IconName; shortcut?: string; onSelect: () => void; disabled?: boolean; hint?: string; external?: boolean; submenu?: boolean; /** A nested menu, opened beside this item. */ items?: MenuItem[]; danger?: boolean; /** The current choice, ticked on the right. */ checked?: boolean }
  | { kind: "separator" }
  | { kind: "header"; label: string };

/**
 * Small dropdown menu anchored to a trigger. Closes on outside click or Esc;
 * arrow keys move between items.
 */
export function Menu({
  trigger,
  items,
  align = "left",
  side = "bottom",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLButtonElement | null) => void }) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  side?: "bottom" | "top";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const subPanel = useRef<HTMLDivElement>(null);
  // The nested menu that is open, and where it sits.
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null);

  const place = () => {
    const r = anchor?.getBoundingClientRect();
    if (!r) return;
    const x = align === "right" ? r.right - width : r.left;
    const y = side === "bottom" ? r.bottom + 6 : r.top - 6;
    setPos({ x: Math.max(8, Math.min(x, window.innerWidth - width - 8)), y });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !subPanel.current?.contains(t) && !anchor?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchor?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const els = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        const i = els.indexOf(document.activeElement as HTMLButtonElement);
        els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor]);

  return (
    <>
      {trigger({
        open,
        toggle: () => {
          place();
          setSub(null);
          setOpen((o) => !o);
        },
        ref: setAnchor,
      })}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            className="animate-pop fixed z-[60] rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-dialog)]"
            style={{ transformOrigin: `${side === "bottom" ? "top" : "bottom"} ${align}`, left: pos.x, width, ...(side === "bottom" ? { top: pos.y } : { bottom: window.innerHeight - pos.y }) }}
          >
            {items.map((it, i) => {
              if (it.kind === "separator") return <div key={i} className="my-1.5 h-px bg-line" role="separator" />;
              if (it.kind === "header") return <p key={i} className="truncate px-2.5 pb-1 pt-1.5 text-[12px] text-muted">{it.label}</p>;
              const nested = !!it.items?.length;
              const openSub = (el: HTMLElement) => {
                const r = el.getBoundingClientRect();
                const w = 200;
                setSub({ i, x: r.right + w + 10 > window.innerWidth ? r.left - w - 4 : r.right + 4, y: r.top - 6 });
              };
              return (
                <button
                  key={i}
                  role="menuitem"
                  aria-haspopup={nested ? "menu" : undefined}
                  aria-expanded={nested ? sub?.i === i : undefined}
                  disabled={it.disabled}
                  onMouseEnter={(e) => (nested ? openSub(e.currentTarget) : setSub(null))}
                  onKeyDown={(e) => {
                    if (nested && e.key === "ArrowRight") {
                      openSub(e.currentTarget);
                      setTimeout(() => subPanel.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
                    }
                  }}
                  onClick={(e) => {
                    if (nested) return openSub(e.currentTarget);
                    setOpen(false);
                    it.onSelect();
                  }}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px]", nested && sub?.i === i && "bg-hover", it.disabled ? "cursor-default text-faint" : it.danger ? "text-danger hover:bg-danger-soft focus:bg-danger-soft focus:outline-none" : "text-ink hover:bg-hover focus:bg-hover focus:outline-none")}
                >
                  {it.icon && <Icon name={it.icon} size={16} className={it.disabled ? "text-faint" : it.danger ? "text-danger" : "text-muted"} />}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
                  {it.shortcut && <span className="text-[11px] text-faint">{it.shortcut}</span>}
                  {it.external && <Icon name="external" size={13} className="text-faint" />}
                  {(it.submenu || nested) && <Icon name="chevron" size={13} className="text-faint" />}
                  {it.checked && <Icon name="check" size={15} className="text-ink" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      {open &&
        sub &&
        typeof document !== "undefined" &&
        (() => {
          const parent = items[sub.i];
          const children = parent && parent.kind !== "separator" && parent.kind !== "header" ? parent.items ?? [] : [];
          return createPortal(
            <div
              ref={subPanel}
              role="menu"
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") panel.current?.querySelectorAll<HTMLButtonElement>("button")[0]?.focus();
              }}
              className="animate-pop fixed z-[61] w-[200px] rounded-2xl border border-line bg-panel p-1.5 shadow-[var(--shadow-dialog)]"
              style={{ left: sub.x, top: sub.y, transformOrigin: "left top" }}
            >
              {children.map((c, j) =>
                c.kind === "separator" ? (
                  <div key={j} className="my-1.5 h-px bg-line" role="separator" />
                ) : c.kind === "header" ? (
                  <p key={j} className="truncate px-2.5 pb-1 pt-1.5 text-[12px] text-muted">{c.label}</p>
                ) : (
                  <button
                    key={j}
                    role="menuitemradio"
                    aria-checked={!!c.checked}
                    onClick={() => {
                      setOpen(false);
                      c.onSelect();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-hover focus:bg-hover focus:outline-none"
                  >
                    {c.icon && <Icon name={c.icon} size={16} className="text-muted" />}
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.checked && <Icon name="check" size={15} className="text-ink" />}
                  </button>
                ),
              )}
            </div>,
            document.body,
          );
        })()}
    </>
  );
}
