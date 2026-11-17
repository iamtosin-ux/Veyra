"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DELAY = 350;
/** Within this long of a tooltip closing, the next opens without the delay (moving along a toolbar). */
const WARM = 600;
const CONTROL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary, label';

/**
 * One quick tooltip for the whole app. Native title tooltips take a second or
 * more and look different everywhere, so a control's title (or, for an icon-only
 * control, its aria-label) is shown here instead, a moment after hovering.
 */
export function Tooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const lastShown = useRef(0);
  const showing = useRef(false);

  // Keep the tip on screen: centre it on the control, then nudge it in from the edges.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(Math.max(8, tip.x - w / 2), window.innerWidth - 8 - w)}px`;
    el.style.visibility = "visible";
  }, [tip]);

  useEffect(() => {
    const hide = () => {
      if (showing.current) lastShown.current = Date.now();
      showing.current = false;
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };

    const textFor = (el: Element): string | null => {
      // Our own title is stashed so the browser doesn't show its slow one as well.
      const title = el.getAttribute("title");
      if (title) {
        el.setAttribute("data-tip", title);
        el.removeAttribute("title");
      }
      const stashed = el.getAttribute("data-tip");
      if (stashed) return stashed;
      // Icon-only controls name themselves through aria-label.
      const label = el.getAttribute("aria-label");
      if (label && !(el as HTMLElement).innerText?.trim() && !el.querySelector('[role="tooltip"]')) return label;
      return null;
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const target = e.target as Element | null;
      const el = target?.closest?.(`[title]:not(iframe), [data-tip], ${CONTROL}`) ?? null;
      if (el === current.current) return;
      hide();
      if (!el) return;
      const text = textFor(el);
      if (!text) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (!el.isConnected || current.current !== el) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 40;
        showing.current = true;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, Date.now() - lastShown.current < WARM ? 0 : DELAY);
    };

    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (current.current && to && current.current.contains(to)) return;
      hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-[280px] rounded-md bg-ink px-2 py-1 text-[11px] font-medium leading-snug text-white shadow-lg"
      style={{ top: tip.y, left: 0, visibility: "hidden", transform: tip.below ? undefined : "translateY(-100%)" }}
    >
      {tip.text}
    </div>
  );
}
