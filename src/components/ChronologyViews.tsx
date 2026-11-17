"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/lib/toast";
import { activityKind } from "@/lib/activities";
import { formatCitation } from "@/lib/types";
import { LANE_TINT, TYPE_ICON, parseStated, type ChronoEvent, type ChronoSourceClick } from "./ChronologyChart";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The evidence type an event mainly rests on, for its colour and icon. */
const typeOf = (e: ChronoEvent) => e.sources[0]?.evidence_type ?? "document";
// Case activity is recorded by a person, not drawn from evidence: a neutral colour and a calendar.
const ACTIVITY_TINT = "#57534e";
const tintOf = (e: ChronoEvent) => (e.origin === "activity" ? ACTIVITY_TINT : LANE_TINT[typeOf(e)] ?? "#8a8a86");
const iconOf = (e: ChronoEvent): IconName => (e.origin === "activity" ? "calendar" : TYPE_ICON[typeOf(e)] ?? "files");
const timeOf = (e: ChronoEvent) => (e.event_datetime ? parseStated(e.event_datetime) : null);
const hasClock = (e: ChronoEvent) => (e.event_datetime?.length ?? 0) > 10;

function whenLabel(e: ChronoEvent): string {
  const t = timeOf(e);
  if (t == null) return e.date_text ?? "Undated";
  const d = new Date(t);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return hasClock(e) ? `${date} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : date;
}

function sortEvents(events: ChronoEvent[]) {
  return [...events].sort((a, b) => (timeOf(a) ?? Infinity) - (timeOf(b) ?? Infinity));
}

/** Sources and notes for one event. */
function EventDetail({ e, onSource, children }: { e: ChronoEvent; onSource: (s: ChronoSourceClick) => void; children?: ReactNode }) {
  if (e.origin === "activity")
    return (
      <div className="space-y-2.5">
        {e.relationship_note && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{e.relationship_note}</p>}
        <p className="text-[12px] text-faint">{activityKind(e.activity_kind)?.label ?? "Case activity"}{e.added_by_name ? `, recorded by ${e.added_by_name}` : ""}</p>
        {children}
      </div>
    );
  return (
    <div className="space-y-2.5">
      {e.date_text && <p className="text-[12px] text-muted">Stated as “{e.date_text}” · {e.time_precision}</p>}
      {e.relationship_note && <p className="text-[12.5px] leading-relaxed text-draft">{e.relationship_note}</p>}
      <div className="flex flex-wrap gap-1.5">
        {e.sources.map((s) => (
          <button
            key={s.observation_id}
            title={s.description}
            onClick={() => onSource({ evidenceId: s.evidence_id, evidenceType: s.evidence_type, source_reference: s.source_reference, observationId: s.observation_id, label: s.description })}
            className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1 text-[12px] hover:border-line-strong"
          >
            <Icon name={TYPE_ICON[s.evidence_type ?? ""] ?? "files"} size={12} className="text-muted" />
            <span className="tabular-nums text-[11px]">{formatCitation(s.evidence_reference, s.source_reference)}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

export interface OrderImpact {
  conflicts: { earlier: { id: string; description: string; when: string }; later: { id: string; description: string; when: string } }[];
  findings: { id: string; reference: string; title: string }[];
}
export type Reorder = (ids: string[], confirm: boolean) => Promise<{ saved: boolean; impact: OrderImpact }>;

const move = (ids: string[], id: string, to: number) => {
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
};

/**
 * Narrow panel: one card per event, in the case's order, tinted by the evidence
 * it rests on. Drag a card (or use Move up / Move down) to reorder; a move that
 * changes what the case says happened asks for confirmation first.
 */
export function ChronologyCards({ events, onSource, onReorder, onRemoveActivity }: { events: ChronoEvent[]; onSource: (s: ChronoSourceClick) => void; onReorder: Reorder; onRemoveActivity?: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, setPending] = useState<{ ids: string[]; impact: OrderImpact } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = events.map((e) => e.id);
  const ids = draft ?? saved;
  const byId = new Map(events.map((e) => [e.id, e]));

  const commit = async (next: string[], confirm = false) => {
    if (next.join() === saved.join()) return setDraft(null);
    setBusy(true);
    try {
      const r = await onReorder(next, confirm);
      if (r.saved) {
        setPending(null);
        setDraft(null);
        toast(r.impact.findings.length ? `Chronology reordered · ${r.impact.findings.length} finding${r.impact.findings.length === 1 ? "" : "s"} to reassess` : "Chronology reordered");
      } else setPending({ ids: next, impact: r.impact });
    } catch (e) {
      setDraft(null);
      toast(e instanceof Error ? e.message : "Could not reorder", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ol className="space-y-2.5 px-3 pb-3">
        {ids.map((id, index) => {
          const e = byId.get(id);
          if (!e) return null;
          const isOpen = open === e.id;
          return (
            <li
              key={e.id}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.effectAllowed = "move";
                setDragging(e.id);
              }}
              onDragOver={(ev) => {
                if (!dragging || dragging === e.id) return;
                ev.preventDefault();
                setDraft(move(ids, dragging, index));
              }}
              onDrop={(ev) => ev.preventDefault()}
              onDragEnd={() => {
                setDragging(null);
                if (draft) void commit(draft);
              }}
              className={cx("group flex overflow-hidden rounded-xl border bg-panel transition-shadow", dragging === e.id ? "border-line-strong opacity-60 shadow-[var(--shadow-card)]" : "border-line")}
            >
              <span aria-hidden className="my-2.5 ml-2.5 w-1 shrink-0 rounded-full" style={{ background: `${tintOf(e)}55` }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start">
                  <button onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} className="block min-w-0 flex-1 px-3 py-3 text-left">
                    <span className="line-clamp-2 text-[14px] font-medium leading-snug">{e.description}</span>
                    <span className="mt-1.5 block text-[12.5px] text-muted">{whenLabel(e)}</span>
                  </button>
                  <span aria-label="Drag to reorder" className="mr-1.5 mt-2.5 grid h-7 w-6 shrink-0 cursor-grab place-items-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
                    <Icon name="drag" size={15} />
                  </span>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <EventDetail e={e} onSource={onSource}>
                      <div className="flex gap-1">
                        <button disabled={index === 0 || busy} onClick={() => void commit(move(saved, e.id, index - 1))} className="h-7 rounded-lg px-2 text-[12px] text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
                          Move up
                        </button>
                        <button disabled={index === ids.length - 1 || busy} onClick={() => void commit(move(saved, e.id, index + 1))} className="h-7 rounded-lg px-2 text-[12px] text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
                          Move down
                        </button>
                        {e.origin === "activity" && onRemoveActivity && (
                          <button onClick={() => onRemoveActivity(e.id)} className="ml-auto h-7 rounded-lg px-2 text-[12px] text-danger hover:bg-danger-soft">
                            Remove
                          </button>
                        )}
                      </div>
                    </EventDetail>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {pending && (
        <ReorderImpactDialog
          impact={pending.impact}
          busy={busy}
          onCancel={() => {
            setPending(null);
            setDraft(null);
          }}
          onConfirm={() => void commit(pending.ids, true)}
        />
      )}
    </>
  );
}

/** Shown before saving an order that contradicts the evidence's dates. */
function ReorderImpactDialog({ impact, busy, onCancel, onConfirm }: { impact: OrderImpact; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-label="This changes the case" className="animate-dialog relative w-full max-w-[460px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-draft-soft text-draft">
            <Icon name="alert" size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold">This changes the case</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">The new order puts events before ones the evidence dates earlier.</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {impact.conflicts.map((c, i) => (
            <li key={i} className="rounded-xl bg-subtle px-3 py-2.5 text-[12.5px] leading-snug">
              <span className="font-medium">{c.earlier.description}</span> <span className="text-muted">({c.earlier.when})</span>
              <span className="mx-1 text-muted">would come before</span>
              <span className="font-medium">{c.later.description}</span> <span className="text-muted">({c.later.when})</span>
            </li>
          ))}
        </ul>
        {impact.findings.length > 0 && (
          <>
            <p className="mt-4 text-[12.5px] font-medium text-muted">These findings rely on them and will be flagged for reassessment</p>
            <ul className="mt-1.5 space-y-1">
              {impact.findings.map((f) => (
                <li key={f.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="shrink-0 tabular-nums text-[11px] text-muted">{f.reference}</span>
                  <span className="min-w-0 truncate">{f.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle">Keep the original order</button>
          <button onClick={onConfirm} disabled={busy} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            {busy ? "Saving…" : "Reorder anyway"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Scale = "minutes" | "hours" | "days" | "months";
const SCALES: { key: Scale; label: string; unit: number }[] = [
  { key: "minutes", label: "Minutes", unit: 5 * MIN },
  { key: "hours", label: "Hours", unit: HOUR },
  { key: "days", label: "Days", unit: DAY },
  { key: "months", label: "Months", unit: 30 * DAY },
];
const COL_W = 44;
const ROW_H = 48;

/** The scale that fits the dated events into a readable number of columns. */
function autoScale(span: number): Scale {
  if (span <= 3 * HOUR) return "minutes";
  if (span <= 3 * DAY) return "hours";
  if (span <= 120 * DAY) return "days";
  return "months";
}

/** Start of the column containing t, so columns line up with clock and calendar boundaries. */
function floorTo(t: number, scale: Scale): number {
  const d = new Date(t);
  if (scale === "months") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const unit = SCALES.find((s) => s.key === scale)!.unit;
  return Math.floor(t / unit) * unit;
}
function addCol(t: number, scale: Scale): number {
  if (scale === "months") {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return t + SCALES.find((s) => s.key === scale)!.unit;
}

/** Wide panel: events as rows against a calendar grid, Gantt style. */
export function ChronologyGantt({ events, onSource, compact }: { events: ChronoEvent[]; onSource: (s: ChronoSourceClick) => void; /** Narrower name column, for the canvas. */ compact?: boolean }) {
  const sorted = useMemo(() => sortEvents(events), [events]);
  const times = sorted.map(timeOf).filter((t): t is number => t != null);
  // With nothing dated the grid is empty; any fixed origin will do.
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  // Follows the events (which may still be loading) until the user picks a scale.
  const [chosen, setScale] = useState<Scale | null>(null);
  const scale = chosen ?? autoScale(max - min);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Columns from one before the first event to a few after the last, at least a screenful.
  const cols = useMemo(() => {
    const out: number[] = [];
    let t = floorTo(min, scale);
    for (let i = 0; i < 2; i++) t = floorTo(t - 1, scale);
    while (out.length < 24 || t <= addCol(max, scale)) {
      out.push(t);
      t = addCol(t, scale);
      if (out.length > 400) break;
    }
    return out;
  }, [min, max, scale]);

  const xOf = (t: number) => {
    const i = Math.max(0, cols.findIndex((c, k) => t >= c && (k === cols.length - 1 || t < cols[k + 1]!)));
    const start = cols[i]!;
    const next = cols[i + 1] ?? addCol(start, scale);
    return (i + (t - start) / (next - start)) * COL_W;
  };

  // Open on the first event.
  const fit = () => {
    const el = scrollRef.current;
    if (el && times.length) el.scrollLeft = Math.max(0, xOf(min) - COL_W * 2);
  };
  useEffect(fit, [scale, min]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * (scrollRef.current.clientWidth - COL_W * 2), behavior: "smooth" });

  const first = new Date(cols[2] ?? min);
  const title = scale === "minutes" || scale === "hours" ? `${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}` : `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`;

  const tick = (t: number) => {
    const d = new Date(t);
    if (scale === "minutes" || scale === "hours") return { top: d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "", main: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` };
    if (scale === "days") return { top: DAYS[d.getUTCDay()]!, main: String(d.getUTCDate()) };
    return { top: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : "", main: MONTHS[d.getUTCMonth()]! };
  };

  const undated = sorted.filter((e) => timeOf(e) == null).length;
  const sel = sorted.find((e) => e.id === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex min-h-0 flex-1">
        {/* Event names */}
        <div className={cx("flex shrink-0 flex-col border-r border-line", compact ? "w-[190px]" : "w-[260px]")}>
          <div className="flex h-[92px] shrink-0 items-end border-b border-line px-5 pb-3 text-[12.5px] text-muted">Event</div>
          <ol className="scroll-panel min-h-0 flex-1">
            {sorted.map((e) => (
              <li key={e.id}>
                <button onClick={() => setSelected(e.id === selected ? null : e.id)} className={cx("flex w-full items-center border-b border-line px-5 text-left text-[13.5px]", e.id === selected ? "bg-subtle" : "hover:bg-subtle")} style={{ height: ROW_H }}>
                  <span className="truncate">{e.description}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Calendar grid */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <p className="flex-1 text-[15px] font-semibold">{title}</p>
            <button onClick={fit} className="h-8 rounded-lg border border-line-strong px-3 text-[12.5px] font-medium hover:bg-subtle">First event</button>
            <select value={scale} onChange={(e) => setScale(e.target.value as Scale)} aria-label="Scale" className="h-8 rounded-lg border border-line-strong bg-panel pl-3 pr-8 text-[12.5px] font-medium">
              {SCALES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => page(-1)} aria-label="Earlier" className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong hover:bg-subtle"><Icon name="chevron" size={15} className="rotate-180" /></button>
            <button onClick={() => page(1)} aria-label="Later" className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong hover:bg-subtle"><Icon name="chevron" size={15} /></button>
          </div>
          <div ref={scrollRef} className="scroll-panel relative min-h-0 flex-1 overflow-auto">
            <div className="relative" style={{ width: cols.length * COL_W, minHeight: "100%" }}>
              {/* Tick header */}
              <div className="sticky top-0 z-10 flex h-11 border-b border-line bg-panel">
                {cols.map((c) => {
                  const k = tick(c);
                  return (
                    <div key={c} className="shrink-0 text-center leading-tight" style={{ width: COL_W }}>
                      <p className="h-4 text-[11px] font-medium text-muted">{k.top}</p>
                      <p className="text-[12px] text-ink">{k.main}</p>
                    </div>
                  );
                })}
              </div>
              {/* Column rules */}
              <div aria-hidden className="pointer-events-none absolute inset-0 top-11 flex">
                {cols.map((c) => <span key={c} className="shrink-0 border-r border-line/60" style={{ width: COL_W }} />)}
              </div>
              {times.length === 0 && <p className="sticky left-4 top-14 z-10 inline-block p-4 text-[13px] text-muted">No dated events to place yet.</p>}
              {/* Events */}
              <ol className="relative">
                {sorted.map((e) => {
                  const t = timeOf(e);
                  const tint = tintOf(e);
                  return (
                    <li key={e.id} className="relative border-b border-line/0" style={{ height: ROW_H }}>
                      {t != null && (
                        <button
                          onClick={() => setSelected(e.id === selected ? null : e.id)}
                          title={`${whenLabel(e)}: ${e.description}`}
                          className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg pr-2 text-[13.5px] text-ink hover:text-ink"
                          style={{ left: xOf(t) - 14 }}
                        >
                          <span
                            className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white", e.time_precision !== "exact" && "outline-2 outline-offset-2 outline-dashed outline-line-strong", e.id === selected && "ring-2 ring-line-strong ring-offset-1")}
                            style={{ background: tint, boxShadow: `0 0 0 3px ${tint}22` }}
                          >
                            <Icon name={iconOf(e)} size={14} />
                          </span>
                          <span className="max-w-[340px] truncate">{e.description}</span>
                          {e.review_status === "accepted" && <Icon name="checkFill" size={14} className="shrink-0 text-ink" />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>

      {sel && (
        <div className="shrink-0 border-t border-line px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-snug">{sel.description}</p>
              <p className="mt-0.5 text-[12.5px] text-muted">{whenLabel(sel)}</p>
            </div>
            <button onClick={() => setSelected(null)} aria-label="Close event" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><Icon name="close" size={15} /></button>
          </div>
          <div className="mt-2.5">
            <EventDetail e={sel} onSource={onSource} />
          </div>
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center border-t border-line px-5 text-[12.5px] text-muted">
        {sorted.length} event{sorted.length === 1 ? "" : "s"}
        {undated > 0 && ` · ${undated} undated`}
      </div>
    </div>
  );
}
