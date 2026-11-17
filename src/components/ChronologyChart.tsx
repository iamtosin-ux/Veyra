"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "@/lib/useWidth";
import type { SourceReference } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";
import { parseStated } from "@/lib/dates";

export { parseStated };

export interface ChronoEvent {
  id: string;
  description: string;
  event_datetime: string | null;
  date_text: string | null;
  time_precision: string;
  relationship_note: string | null;
  review_status: string;
  /** Drawn from evidence, or case activity recorded by a person (a filing, a hearing, a police visit). */
  origin?: "evidence" | "activity";
  activity_kind?: string | null;
  added_by_name?: string | null;
  sources: {
    observation_id: string;
    observation_reference: string;
    evidence_id: string;
    evidence_reference: string;
    evidence_type?: string;
    source_reference: SourceReference;
    description: string;
  }[];
}

export interface ChronoSourceClick {
  evidenceId: string;
  evidenceType?: string;
  source_reference: SourceReference;
  observationId: string;
  label: string;
}

export const TYPE_ICON: Record<string, IconName> = { video: "video", audio: "volume", image: "files", document: "pack", written_account: "list" };
export const LANE_TINT: Record<string, string> = { video: "#6b4fc8", audio: "#2f8f6a", image: "#b03a73", document: "#2f5aa8", written_account: "#b8741a" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
const LABEL_W = 168;
const ROW_H = 26;
const ZOOMS = [1, 2, 4, 8, 16, 32, 64];


function fmt(t: number, withTime: boolean) {
  const d = new Date(t);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime ? `${date}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : date;
}

/**
 * Swimlane chronology: one row per evidence item, events placed on a calendar
 * axis, with a connector where one event draws on several items.
 */
export function ChronologyChart({ events, names, onSource }: { events: ChronoEvent[]; names: Map<string, string>; onSource: (s: ChronoSourceClick) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [zoom, setZoomState] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCentre = useRef<number | null>(null);
  /** Change zoom keeping a given fraction of the plot (default: the view's centre) in place. */
  const setZoom = (next: number, focusFraction?: number) => {
    const el = scrollRef.current;
    if (el) {
      const plot = el.scrollWidth - LABEL_W - 8;
      const centre = focusFraction ?? (el.scrollLeft + (el.clientWidth - LABEL_W) / 2) / Math.max(plot, 1);
      pendingCentre.current = Math.min(Math.max(centre, 0), 1);
    }
    setZoomState(next);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingCentre.current == null) return;
    const plot = el.scrollWidth - LABEL_W - 8;
    el.scrollLeft = pendingCentre.current * plot - (el.clientWidth - LABEL_W) / 2;
    pendingCentre.current = null;
  }, [zoom]);
  const [hover, setHover] = useState<{ x: number; y: number; ev: ChronoEvent; t: number } | null>(null);

  const dated = useMemo(
    () =>
      events
        .map((e) => ({ e, t: e.event_datetime ? parseStated(e.event_datetime) : null }))
        .filter((x): x is { e: ChronoEvent; t: number } => x.t != null)
        .sort((a, b) => a.t - b.t),
    [events],
  );
  const undated = events.filter((e) => !e.event_datetime);

  // One lane per evidence item, in order of first appearance.
  const lanes = useMemo(() => {
    const seen = new Map<string, { id: string; ref: string; type: string; label: string }>();
    for (const { e } of dated)
      for (const s of e.sources)
        if (!seen.has(s.evidence_id)) seen.set(s.evidence_id, { id: s.evidence_id, ref: s.evidence_reference, type: s.evidence_type ?? "", label: names.get(s.evidence_id) ?? s.evidence_reference });
    return [...seen.values()];
  }, [dated, names]);
  const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));

  if (dated.length === 0) {
    return <p className="text-[12px] text-faint">No dated events yet.{undated.length ? ` ${undated.length} undated event(s) are listed in the list view.` : ""}</p>;
  }

  const first = dated[0].t;
  const last = dated[dated.length - 1].t;
  // Pad to whole days either side so single-day cases still have room.
  const start = Math.floor(first / DAY) * DAY - DAY;
  const end = Math.ceil(last / DAY) * DAY + DAY;
  const plotW = Math.max(240, (width || 600) - LABEL_W - 8) * zoom;
  const pxPerDay = plotW / ((end - start) / DAY);
  const x = (t: number) => ((t - start) / (end - start)) * plotW;

  // Axis: month band, plus day ticks whose spacing adapts to zoom.
  const dayStep = pxPerDay >= 28 ? 1 : pxPerDay >= 12 ? 2 : pxPerDay >= 5 ? 7 : 14;
  const dayTicks: number[] = [];
  for (let t = start; t <= end; t += DAY * dayStep) dayTicks.push(t);
  const hourTicks: number[] = [];
  if (pxPerDay >= 240) {
    const step = pxPerDay >= 960 ? 3 : 6;
    for (let t = start; t <= end; t += step * 3_600_000) if ((t - start) % DAY !== 0) hourTicks.push(t);
  }
  const months: { t: number; label: string }[] = [];
  {
    const d = new Date(start);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    while (t <= end) {
      const dd = new Date(t);
      months.push({ t: Math.max(t, start), label: `${MONTHS[dd.getUTCMonth()]} ${dd.getUTCFullYear()}` });
      t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1);
    }
  }

  const plotH = lanes.length * ROW_H;
  const hasTime = (e: ChronoEvent) => !!e.event_datetime && e.event_datetime.length > 10;

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-2 flex items-center justify-end gap-1">
        <button onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === 1} aria-label="Zoom out" className="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
          <Icon name="zoomOut" size={13} />
        </button>
        <span className="w-7 text-center tabular-nums text-[11px] text-faint">{zoom}×</span>
        {zoom > 1 && <button onClick={() => setZoom(1)} className="ml-1 rounded-lg px-1.5 text-[11px] text-muted hover:bg-hover hover:text-ink">Fit</button>}
        <button onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" className="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
          <Icon name="zoomIn" size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="scroll-panel overflow-x-auto overflow-y-hidden rounded-xl border border-line">
        <div className="relative" style={{ width: LABEL_W + plotW + 8 }}>
          {/* Axis */}
          <div className="sticky top-0 flex border-b border-line bg-[#fafaf9]">
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-[#fafaf9]" style={{ width: LABEL_W }} />
            <div className="relative h-11" style={{ width: plotW }}>
              {months.map((m) => (
                <span key={m.t} className="absolute top-1 whitespace-nowrap text-[11px] font-medium text-muted" style={{ left: x(m.t) + 4 }}>
                  {m.label}
                </span>
              ))}
              {dayTicks.map((t) => (
                <span key={t} className="absolute top-[22px] -translate-x-1/2 tabular-nums text-[11px] text-faint" style={{ left: x(t) }}>
                  {new Date(t).getUTCDate()}
                </span>
              ))}
              {hourTicks.map((t) => (
                <span key={t} className="absolute top-[24px] -translate-x-1/2 tabular-nums text-[9px] text-line-strong" style={{ left: x(t) }}>
                  {String(new Date(t).getUTCHours()).padStart(2, "0")}h
                </span>
              ))}
            </div>
          </div>

          {/* Lanes */}
          <div className="relative flex">
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-panel" style={{ width: LABEL_W }}>
              {lanes.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5 border-b border-line/60 px-2.5 text-[11px] last:border-b-0" style={{ height: ROW_H }}>
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white" style={{ background: LANE_TINT[l.type] ?? "#8a8a86" }}>
                    <Icon name={TYPE_ICON[l.type] ?? "files"} size={9} />
                  </span>
                  <span className="truncate text-muted" title={l.label}>{l.label}</span>
                </div>
              ))}
            </div>
            <div
              className="relative"
              style={{ width: plotW, height: plotH }}
              title="Double-click to zoom in here"
              onDoubleClick={(ev) => {
                if (ev.target !== ev.currentTarget && (ev.target as HTMLElement).tagName === "BUTTON") return;
                const rect = ev.currentTarget.getBoundingClientRect();
                const i = ZOOMS.indexOf(zoom);
                if (i < ZOOMS.length - 1) setZoom(ZOOMS[Math.min(ZOOMS.length - 1, i + 2)], (ev.clientX - rect.left) / rect.width);
              }}
            >
              {/* Gridlines */}
              {lanes.map((l, i) => (
                <div key={l.id} className="absolute inset-x-0 border-b border-line/60" style={{ top: i * ROW_H, height: ROW_H }}>
                  <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: `${LANE_TINT[l.type] ?? "#8a8a86"}22` }} />
                </div>
              ))}
              {dayTicks.map((t) => (
                <div key={t} className="absolute bottom-0 top-0 w-px bg-line/50" style={{ left: x(t) }} />
              ))}

              {/* Events */}
              {dated.map(({ e, t }) => {
                const rows = [...new Set(e.sources.map((s) => laneIndex.get(s.evidence_id)).filter((r): r is number => r != null))].sort((a, b) => a - b);
                if (!rows.length) return null;
                const cx0 = x(t);
                const accepted = e.review_status === "accepted";
                const colour = accepted ? "#2f8f6a" : "#4f5bd5";
                const top = rows[0] * ROW_H + ROW_H / 2;
                const bottom = rows[rows.length - 1] * ROW_H + ROW_H / 2;
                return (
                  <div key={e.id}>
                    {rows.length > 1 && <div className="absolute w-[6px] -translate-x-1/2 rounded-full" style={{ left: cx0, top, height: bottom - top, background: `${colour}33` }} />}
                    {e.sources.map((s) => {
                      const r = laneIndex.get(s.evidence_id);
                      if (r == null) return null;
                      return (
                        <button
                          key={s.observation_id}
                          onMouseEnter={(ev) => {
                            const box = wrapRef.current?.getBoundingClientRect();
                            const b = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                            if (box) setHover({ x: b.left - box.left + b.width / 2, y: b.top - box.top, ev: e, t });
                          }}
                          onMouseLeave={() => setHover(null)}
                          onFocus={(ev) => {
                            const box = wrapRef.current?.getBoundingClientRect();
                            const b = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                            if (box) setHover({ x: b.left - box.left + b.width / 2, y: b.top - box.top, ev: e, t });
                          }}
                          onBlur={() => setHover(null)}
                          onClick={() => onSource({ evidenceId: s.evidence_id, evidenceType: s.evidence_type, source_reference: s.source_reference, observationId: s.observation_id, label: s.description })}
                          aria-label={`${fmt(t, hasTime(e))}: ${e.description} (${s.evidence_reference})`}
                          className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel transition-transform hover:scale-125"
                          style={{ left: cx0, top: r * ROW_H + ROW_H / 2, background: colour }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 w-72 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 text-[12px] shadow-[var(--shadow-dialog)]"
          style={{ left: Math.min(Math.max(hover.x, 150), (width || 600) - 150), top: hover.y - 8 }}
        >
          <p className="font-medium tabular-nums text-muted">{fmt(hover.t, hasTime(hover.ev))}{hover.ev.date_text && hover.ev.date_text !== hover.ev.event_datetime ? ` · “${hover.ev.date_text}”` : ""}</p>
          <p className="mt-1 leading-snug text-ink">{hover.ev.description}</p>
          {hover.ev.relationship_note && <p className="mt-1 text-draft">{hover.ev.relationship_note}</p>}
          <p className="mt-1.5 text-[11px] text-faint">{hover.ev.sources.map((s) => names.get(s.evidence_id) ?? s.evidence_reference).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} · click a dot to open its source</p>
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-muted">Undated</p>
          <ul className="mt-1 space-y-1">
            {undated.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[12px]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                <span>
                  {e.description}
                  {e.sources[0] && (
                    <button
                      onClick={() => onSource({ evidenceId: e.sources[0].evidence_id, evidenceType: e.sources[0].evidence_type, source_reference: e.sources[0].source_reference, observationId: e.sources[0].observation_id, label: e.sources[0].description })}
                      className={cx("ml-1.5 text-accent hover:underline")}
                    >
                      source
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-faint">Times are shown as stated in each source; device clocks are not verified.</p>
    </div>
  );
}
