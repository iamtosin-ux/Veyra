"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatTimestamp, type SourceReference } from "@/lib/types";
import type { ObservationItem } from "./Observations";
import { TONE, short } from "./AudioTranscript";
import type { AnnotateAt } from "./InlineAnnotate";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

export interface TimelineSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}
export interface TimelineSound {
  start_seconds: number;
  end_seconds: number;
  rise_db: number;
}
export interface TimelineFrame {
  id: string;
  t: number;
  file?: string;
}

const PEAKS = 2000;
const MAX_DECODE_BYTES = 80 * 1024 * 1024;
const peakCache = new Map<string, Promise<number[] | null>>();

/**
 * The recording's real loudness, decoded in the browser: one peak per slice,
 * scaled 0 to 1. Null when the file is too large or its audio can't be read.
 */
function loadPeaks(url: string): Promise<number[] | null> {
  let p = peakCache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok || Number(r.headers.get("content-length") ?? 0) > MAX_DECODE_BYTES) return null;
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(await r.arrayBuffer());
        void ctx.close();
        const data = audio.getChannelData(0);
        const size = Math.max(1, Math.floor(data.length / PEAKS));
        const out: number[] = [];
        for (let i = 0; i < PEAKS; i++) {
          let max = 0;
          for (let j = i * size, end = Math.min(data.length, j + size); j < end; j++) max = Math.max(max, Math.abs(data[j]!));
          out.push(max);
        }
        const top = Math.max(...out, 1e-6);
        return out.map((v) => v / top);
      } catch {
        return null;
      }
    })();
    peakCache.set(url, p);
  }
  return p;
}

function usePeaks(url: string) {
  const [peaks, setPeaks] = useState<number[] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadPeaks(url).then((p) => live && setPeaks(p));
    return () => {
      live = false;
    };
  }, [url]);
  return peaks;
}

function niceStep(duration: number, width: number): number {
  const target = duration / Math.max(4, width / 90);
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (s >= target) return s;
  return 3600;
}

/** Width of the lane names down the left, which stay put while the tracks scroll. */
const GUTTER = 128;

/** 0:13.1, the way an editor reads a playhead. */
const precise = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Multi-lane timeline under a recording: frames, observations, sounds and the
 * spoken words over the waveform, all on one ruler with a shared playhead.
 */
export function MediaTimeline(props: {
  evidenceId: string;
  audioOnly: boolean;
  duration: number;
  time: number;
  playing: boolean;
  rate: number;
  muted: boolean;
  citation: SourceReference & { transcript_segment_ids?: string[] };
  segments: TimelineSegment[];
  sounds: TimelineSound[];
  frames: TimelineFrame[];
  observations: ObservationItem[];
  /** Off in the vault, where the recording is shown without any case's reading of it. */
  showObservations?: boolean;
  selectedObs: string | null;
  onSeek: (t: number) => void;
  onPick?: (p: AnnotateAt) => void;
  onToggle: () => void;
  onRate: () => void;
  onMute: () => void;
  onSelectObs: (o: ObservationItem) => void;
}) {
  const { duration, time, citation: sr } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const peaks = usePeaks(`/api/evidence/${props.evidenceId}/file`);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - GUTTER - 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trackWidth = Math.max(200, width * zoom);
  const pps = duration > 0 ? trackWidth / duration : 0;
  const x = (t: number) => t * pps;
  const step = niceStep(duration, trackWidth);

  // Keep the playhead in view while playing or after a seek.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom === 1) return;
    const px = GUTTER + x(time);
    if (px < el.scrollLeft + 20 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = px - el.clientWidth / 3;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, zoom]);

  const fromPointer = (e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (e.clientX - rect.left) / (pps || 1)));
  };

  // Clicking empty space seeks; dragging marks a range to annotate.
  const laneHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const t = fromPointer(e);
      props.onSeek(t);
      if (!props.onPick) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setSel({ a: t, b: t });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => sel && e.buttons === 1 && setSel({ ...sel, b: fromPointer(e) }),
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!sel || !props.onPick) return;
      const [a, b] = [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)];
      props.onPick({ start: a, end: b - a >= 0.3 ? b : null, x: e.clientX, y: e.clientY });
      setSel(null);
    },
  };

  const citedStart = sr.start_time_seconds;
  const citedEnd = sr.end_time_seconds ?? sr.start_time_seconds;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  // Observation labels stacked into rows so neighbours don't overlap.
  const markers = useMemo(() => {
    const lastX: number[] = [];
    const items = [...props.observations]
      .sort((a, b) => (a.source_reference.start_time_seconds ?? 0) - (b.source_reference.start_time_seconds ?? 0))
      .map((o) => {
        const px = x(o.source_reference.start_time_seconds ?? 0);
        let row = lastX.findIndex((l) => px - l > 170);
        if (row === -1) row = lastX.length;
        lastX[row] = px;
        return { o, px, row, human: o.modality === "reviewer" };
      });
    return { items, rows: Math.max(1, lastX.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.observations, pps]);

  // One bar every 3px of track, sampled from the decoded peaks.
  const bars = useMemo(() => {
    if (!peaks) return null;
    const n = Math.max(1, Math.floor(trackWidth / 3));
    return Array.from({ length: n }, (_, i) => {
      const from = Math.floor((i / n) * peaks.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / n) * peaks.length));
      let m = 0;
      for (let j = from; j < to; j++) m = Math.max(m, peaks[j]!);
      return m;
    });
  }, [peaks, trackWidth]);

  const frameSrc = (f: TimelineFrame) => (f.file ? `/api/evidence/${props.evidenceId}/derived?path=${encodeURIComponent(f.file)}` : null);

  return (
    <div className="shrink-0 border-t border-line bg-panel">
      {/* Transport */}
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-4">
        <div className="flex items-center gap-1">
          <span className="mr-2 whitespace-nowrap tabular-nums text-[13px]">
            {precise(time)} <span className="text-faint">/ {precise(duration)}</span>
          </span>
          <button onClick={props.onRate} className="h-7 rounded-lg px-2 tabular-nums text-[11px] text-muted hover:bg-hover hover:text-ink" aria-label="Playback speed">{props.rate}×</button>
          <button onClick={props.onMute} aria-label={props.muted ? "Unmute" : "Mute"} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><Icon name={props.muted ? "mute" : "volume"} size={15} /></button>
          {citedStart != null && (
            <button onClick={() => props.onSeek(citedStart)} className="ml-1 rounded-lg bg-accent-soft px-2.5 py-1 tabular-nums text-[11px] font-medium text-accent hover:bg-[#e2e5fa]">
              Cited {formatTimestamp(citedStart)}{citedEnd != null && citedEnd !== citedStart ? `–${formatTimestamp(citedEnd)}` : ""}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => props.onSeek(time - 5)} aria-label="Back 5 seconds" className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-hover"><Icon name="back" size={16} /></button>
          <button onClick={props.onToggle} aria-label={props.playing ? "Pause" : "Play"} className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white hover:bg-primary-hover">
            <Icon name={props.playing ? "pauseFill" : "play"} size={17} />
          </button>
          <button onClick={() => props.onSeek(time + 5)} aria-label="Forward 5 seconds" className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-hover"><Icon name="forward" size={16} /></button>
        </div>
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => setZoom((z) => Math.max(1, z / 2))} disabled={zoom === 1} aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink disabled:opacity-40"><Icon name="zoomOut" size={15} /></button>
          <span className="w-8 text-center tabular-nums text-[11px] text-faint">{zoom}×</span>
          <button onClick={() => setZoom((z) => Math.min(16, z * 2))} aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><Icon name="zoomIn" size={15} /></button>
        </div>
      </div>

      {/* Ruler and lanes: names in a fixed column on the left, tracks scrolling on the right */}
      <div ref={scrollRef} className="scroll-panel max-h-[360px] overflow-x-auto overflow-y-auto border-t border-line">
        <div className="relative" style={{ width: GUTTER + trackWidth + 16 }}>
          <div className="sticky top-0 z-40 flex h-8 border-b border-line bg-panel">
            <div className="sticky left-0 z-30 flex shrink-0 items-center border-r border-line bg-panel px-3 tabular-nums text-[12px] font-medium text-ink" style={{ width: GUTTER }}>
              {precise(time)}
            </div>
            <div
              className="relative cursor-pointer touch-none"
              style={{ width: trackWidth }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                props.onSeek(fromPointer(e));
              }}
              onPointerMove={(e) => e.buttons === 1 && props.onSeek(fromPointer(e))}
            >
              {/* A full-height line at each labelled time, short marks between */}
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 border-l border-line-strong pl-1.5 pt-1.5 tabular-nums text-[11px] leading-none text-muted" style={{ left: x(t) }}>
                  {formatTimestamp(t)}
                </span>
              ))}
              {ticks.flatMap((t) => [1, 2, 3].map((k) => t + (step * k) / 4)).filter((t) => t < duration).map((t) => (
                <span key={`m${t}`} aria-hidden className="absolute bottom-0 h-2 w-px bg-line-strong" style={{ left: x(t) }} />
              ))}
              {/* The playhead's time, riding the ruler */}
              <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md bg-ink px-1.5 py-px tabular-nums text-[10.5px] font-medium leading-[16px] text-white" style={{ left: x(time) }}>
                {formatTimestamp(time)}
              </div>
            </div>
          </div>

          {!props.audioOnly && props.frames.length > 0 && (
            <Lane icon="video" label="Frames" height={92} width={trackWidth} handlers={laneHandlers}>
              {/* A filmstrip: each frame holds the track from its moment until the next */}
              {[...props.frames].sort((a, b) => a.t - b.t).map((f, i, all) => {
                const src = frameSrc(f);
                const isCited = (sr.frame_times ?? []).some((t) => Math.abs(t - f.t) < 0.3);
                const left = x(f.t);
                const w = Math.max(8, (all[i + 1] ? x(all[i + 1]!.t) : trackWidth) - left - 3);
                return (
                  <button
                    key={f.id}
                    onClick={() => props.onSeek(f.t)}
                    aria-label={`Frame at ${formatTimestamp(f.t)}`}
                    className={cx("absolute bottom-2 top-2 flex flex-col overflow-hidden rounded-xl border bg-subtle", isCited ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong")}
                    style={{ left, width: w }}
                  >
                    <span className="block min-h-0 flex-1 bg-[#0d0d0d]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- derived frames are served as-is */}
                      {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </span>
                    <span className="h-4 truncate px-1.5 text-left tabular-nums text-[10px] leading-4 text-muted">{w > 40 ? formatTimestamp(f.t) : ""}</span>
                  </button>
                );
              })}
            </Lane>
          )}

          {props.showObservations !== false && (
            <Lane icon="flag" label="Observations" height={markers.rows * 30 + 16} width={trackWidth} handlers={laneHandlers}>
              {markers.items.map(({ o, px, row, human }) => {
                const tone = human ? TONE.human : TONE.ai;
                return (
                  <button
                    key={o.id}
                    onClick={() => props.onSelectObs(o)}
                    title={`${human ? "Annotation" : "Observation"} at ${formatTimestamp(o.source_reference.start_time_seconds)}: ${o.description}`}
                    style={{ left: Math.max(0, Math.min(px - 12, trackWidth - 180)), top: 8 + row * 30 }}
                    className={cx("absolute z-10 max-w-[180px] truncate rounded-full px-3 py-1 text-[12px] font-medium", tone.pill, o.id === props.selectedObs && "ring-2 ring-line-strong ring-offset-1")}
                  >
                    {short(o.description)}
                  </button>
                );
              })}
              {markers.items.length === 0 && <p className="absolute left-3 top-1/2 -translate-y-1/2 text-[11.5px] text-faint">{props.onPick ? "Drag across the timeline to annotate a moment" : "None"}</p>}
            </Lane>
          )}

          {props.sounds.length > 0 && (
            <Lane icon="volume" label="Sounds" height={52} width={trackWidth} handlers={laneHandlers}>
              {props.sounds.map((s, i) => (
                <button
                  key={i}
                  onClick={() => props.onSeek(s.start_seconds)}
                  title={`Abrupt level rise +${s.rise_db.toFixed(0)} dB (cause not identified)`}
                  style={{ left: x(s.start_seconds), width: Math.max(14, x(s.end_seconds - s.start_seconds)) }}
                  className="absolute bottom-2 top-2 flex items-center rounded-lg border border-line bg-subtle px-2 tabular-nums text-[11px] text-muted hover:border-line-strong"
                >
                  {x(s.end_seconds - s.start_seconds) > 40 ? `Sound +${s.rise_db.toFixed(0)} dB` : `+${s.rise_db.toFixed(0)}`}
                </button>
              ))}
            </Lane>
          )}

          <Lane icon="mic" label="Speech" height={80} width={trackWidth} handlers={laneHandlers}>
            {props.segments.map((seg) => {
              const left = x(seg.start_seconds);
              const width = Math.max(6, x(seg.end_seconds - seg.start_seconds) - 3);
              const active = time >= seg.start_seconds && time < seg.end_seconds;
              const cited = (sr.transcript_segment_ids ?? []).includes(seg.id);
              const slice = bars ? bars.slice(Math.floor(left / 3), Math.ceil((left + width) / 3)) : [];
              return (
                <button
                  key={seg.id}
                  onClick={() => props.onSeek(seg.start_seconds)}
                  title={seg.text}
                  style={{ left, width }}
                  className={cx(
                    "absolute bottom-2 top-2 flex flex-col overflow-hidden rounded-xl border bg-subtle text-left",
                    active ? "border-ink" : cited ? "border-[#c79a6b] bg-[#f6efe7]" : "border-line hover:border-line-strong",
                  )}
                >
                  {width > 40 && <span className="truncate px-2.5 pt-1.5 text-[12px] text-ink">{seg.text}</span>}
                  <Wave bars={slice} />
                </button>
              );
            })}
            {props.segments.length === 0 && (
              // No transcript: the whole recording's waveform as one clip.
              <div className="absolute inset-x-0 bottom-2 top-2 flex flex-col overflow-hidden rounded-xl border border-line bg-subtle">
                {bars ? <Wave bars={bars} /> : <span className="my-auto h-px w-full bg-line-strong" />}
              </div>
            )}
          </Lane>

          {sel && Math.abs(sel.b - sel.a) > 0 && (
            <div className="pointer-events-none absolute bottom-0 top-8 z-0 border-x border-[#d9822b]/50 bg-[#d9822b]/10" style={{ left: GUTTER + x(Math.min(sel.a, sel.b)), width: x(Math.abs(sel.b - sel.a)) }} />
          )}
          {citedStart != null && (
            <div className="pointer-events-none absolute bottom-0 top-8 z-0 border-x border-accent/30 bg-accent/[0.06]" style={{ left: GUTTER + x(citedStart), width: Math.max(2, x((citedEnd ?? citedStart) - citedStart)) }} />
          )}
          {/* Playhead line across every lane; it passes under the lane names */}
          <div className="pointer-events-none absolute bottom-0 top-8 z-20 w-px bg-ink" style={{ left: GUTTER + x(time) }} />
        </div>
      </div>
    </div>
  );
}

/** A clip's loudness: grey bars along its foot. */
function Wave({ bars }: { bars: number[] }) {
  return (
    <span className="mt-auto flex h-6 items-end gap-px overflow-hidden px-1.5 pb-1">
      {bars.map((v, i) => (
        <span key={i} className="w-[2px] shrink-0 rounded-[1px] bg-[#c4c4c4]" style={{ height: `${Math.max(10, v * 100)}%` }} />
      ))}
    </span>
  );
}

/** One track: its name in the fixed column, then its clips on the time axis, ruled off from the next. */
function Lane({
  icon,
  label,
  height,
  width,
  handlers,
  children,
}: {
  icon: IconName;
  label: string;
  height: number;
  width: number;
  /** Seek on click; drag to mark a range. */
  handlers: Record<string, (e: ReactPointerEvent<HTMLDivElement>) => void>;
  children: ReactNode;
}) {
  return (
    <div className="flex border-b border-line last:border-b-0" style={{ height }}>
      <div className="sticky left-0 z-30 flex shrink-0 items-center gap-2 border-r border-line bg-panel px-3 text-[12px] font-medium text-ink" style={{ width: GUTTER }}>
        <Icon name={icon} size={16} className="shrink-0 text-muted" />
        <span className="truncate">{label}</span>
      </div>
      <div className="relative" style={{ width }} {...handlers}>
        {children}
      </div>
    </div>
  );
}
