"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatTimestamp } from "@/lib/types";
import type { ObservationItem } from "./Observations";
import { Icon } from "./Icon";
import type { AnnotateAt } from "./InlineAnnotate";
import { cx } from "./ui";

interface Segment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
  speaker?: string;
}

const BARS = 140;

// AI observations and human annotations get their own colour.
export const TONE = {
  ai: { dot: "bg-[#8db4dd]", line: "bg-[#2f6fa3]/60", pill: "bg-[#e4eef8] text-[#1f4f7a] hover:bg-[#d5e4f3]" },
  human: { dot: "bg-[#f0b46a]", line: "bg-[#d9822b]/60", pill: "bg-[#fcebd6] text-[#8a4a10] hover:bg-[#f9dfbf]" },
};

export const short = (t: string) => {
  const words = t.replace(/^(The|A|An) /, "").split(/\s+/).slice(0, 4).join(" ");
  return words.length < t.length ? `${words.replace(/[,.;:]$/, "")}…` : words;
};

// Bar heights for the waveform: louder where someone is speaking, varied by a
// fixed seed so the shape stays the same between renders.
function waveform(seed: string, duration: number, segments: Segment[]) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  return Array.from({ length: BARS }, (_, i) => {
    const t = ((i + 0.5) / BARS) * duration;
    const speech = segments.some((s) => t >= s.start_seconds && t <= s.end_seconds);
    return speech ? 0.35 + rand() * 0.65 : 0.08 + rand() * 0.18;
  });
}

/**
 * Audio evidence: a waveform player with the transcript underneath. The line
 * being spoken is highlighted, and observations are flagged on the line they cite.
 */
export function AudioTranscript({
  evidenceId,
  duration,
  time,
  playing,
  segments,
  observations,
  selectedObs,
  onSeek,
  onPick,
  onToggle,
  onSelectObs,
  cited,
  compact,
  player = true,
}: {
  /** Off when a full timeline below provides playback, the waveform and markers. */
  player?: boolean;
  /** A range to keep highlighted, e.g. the moment a finding cites. */
  cited?: { start: number; end: number } | null;
  /** Tighter layout for side-by-side comparison. */
  compact?: boolean;
  evidenceId: string;
  duration: number;
  time: number;
  playing: boolean;
  segments: Segment[];
  observations: ObservationItem[];
  selectedObs: string | null;
  onSeek: (t: number) => void;
  onPick?: (p: AnnotateAt) => void;
  onToggle: () => void;
  onSelectObs: (o: ObservationItem) => void;
}) {
  const bars = useMemo(() => waveform(evidenceId, duration || 1, segments), [evidenceId, duration, segments]);
  const progress = duration ? time / duration : 0;
  const activeRef = useRef<HTMLLIElement>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const at = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
  };
  const active = segments.find((s) => time >= s.start_seconds && time < s.end_seconds)?.id;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  // Stack labels into lanes so neighbouring ones don't overlap.
  const markers = useMemo(() => {
    const lastX: number[] = [];
    const items = [...observations]
      .sort((a, b) => (a.source_reference.start_time_seconds ?? 0) - (b.source_reference.start_time_seconds ?? 0))
      .map((o) => {
        const x = Math.min(1, (o.source_reference.start_time_seconds ?? 0) / (duration || 1));
        let lane = lastX.findIndex((l) => x - l > 0.16);
        if (lane === -1) lane = lastX.length;
        lastX[lane] = x;
        return { o, x, lane, human: o.modality === "reviewer" };
      });
    return { items, lanes: Math.max(1, lastX.length) };
  }, [observations, duration]);

  const flagsFor = (s: Segment) =>
    observations.filter((o) => {
      const start = o.source_reference.start_time_seconds ?? -1;
      return start >= s.start_seconds && start < s.end_seconds;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Player */}
      {player && (
      <div className="shrink-0 px-6 pb-4 pt-5">
        <div className="flex items-center gap-4">
          <button onClick={() => onSeek(time - 10)} aria-label="Back 10 seconds" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="replay10" size={20} />
          </button>
          <button onClick={onToggle} aria-label={playing ? "Pause" : "Play"} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink text-white hover:bg-primary-hover">
            <Icon name={playing ? "pauseFill" : "play"} size={19} />
          </button>
          <button onClick={() => onSeek(time + 10)} aria-label="Forward 10 seconds" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="forward10" size={20} />
          </button>
          <span className="tabular-nums text-[13px] tabular-nums text-muted">
            {formatTimestamp(time)} <span className="text-faint">/ {formatTimestamp(duration)}</span>
          </span>
          <div className="ml-auto flex items-center gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-full", TONE.ai.dot)} /> Observation</span>
            <span className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-full", TONE.human.dot)} /> Annotation</span>
            <a href={`/api/evidence/${evidenceId}/file`} download aria-label="Download audio" title="Download" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="download" size={17} />
            </a>
          </div>
        </div>

        {/* Waveform track; markers drop from the moment they cite to a label underneath */}
        <div className="relative mt-4">
          <div className="rounded-[20px] bg-subtle px-5 py-4">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(time)}
              onPointerDown={(e) => {
                const t = at(e);
                onSeek(t);
                if (!onPick) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setSel({ a: t, b: t });
              }}
              onPointerMove={(e) => sel && e.buttons === 1 && setSel({ ...sel, b: at(e) })}
              onPointerUp={(e) => {
                if (!sel || !onPick) return;
                const [a, b] = [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)];
                onPick({ start: a, end: b - a >= 0.3 ? b : null, x: e.clientX, y: e.clientY });
                setSel(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
              }}
              className={cx("relative flex h-14 touch-none items-center gap-[2px]", onPick ? "cursor-crosshair" : "cursor-pointer")}
            >
              {bars.map((b, i) =>
                b < 0.28 ? (
                  <span key={i} className={cx("h-px min-w-0 flex-1", (i + 0.5) / BARS <= progress ? "bg-ink/60" : "bg-line-strong")} />
                ) : (
                  <span key={i} className={cx("min-w-0 flex-1 rounded-full", (i + 0.5) / BARS <= progress ? "bg-ink" : "bg-line-strong")} style={{ height: `${b * 100}%` }} />
                ),
              )}
              {sel && sel.a !== sel.b && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-y-1 rounded-md border-x border-[#d9822b]/60 bg-[#d9822b]/15"
                  style={{ left: `${(Math.min(sel.a, sel.b) / (duration || 1)) * 100}%`, width: `${(Math.abs(sel.b - sel.a) / (duration || 1)) * 100}%` }}
                />
              )}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-ink" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="relative mx-5" style={{ height: markers.lanes * 34 + 6 }}>
            {markers.items.map(({ o, x, lane, human }) => {
              const tone = human ? TONE.human : TONE.ai;
              const on = o.id === selectedObs;
              return (
                <div key={o.id} className="absolute top-0" style={{ left: `${x * 100}%`, height: lane * 34 + 30 }}>
                  <span aria-hidden className={cx("absolute bottom-[26px] left-0 w-px", tone.line)} style={{ top: -78 }} />
                  <button
                    onClick={() => onSelectObs(o)}
                    title={`${human ? "Annotation" : "Observation"} at ${formatTimestamp(o.source_reference.start_time_seconds)}: ${o.description}`}
                    className={cx(
                      // Near either edge the label hangs inwards from its line instead of centring on it.
                      "absolute bottom-0 max-w-[180px] truncate rounded-full px-3 py-1 text-[12px] font-medium",
                      x < 0.08 ? "-left-3" : x > 0.92 ? "-right-3 [left:auto]" : "-translate-x-1/2",
                      tone.pill,
                      on && "ring-2 ring-line-strong ring-offset-1",
                    )}
                  >
                    {short(o.description)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Transcript */}
      <ol className="scroll-panel min-h-0 flex-1 px-6 py-4">
        {segments.length === 0 && <li className="py-6 text-[13px] text-muted">No transcript yet.</li>}
        {segments.map((s) => {
          const flags = flagsFor(s);
          const isActive = s.id === active;
          const isFuture = time < s.start_seconds;
          const isCited = !!cited && s.end_seconds > cited.start && s.start_seconds < Math.max(cited.end, cited.start + 0.01);
          return (
            <li key={s.id} ref={isActive ? activeRef : undefined} className="group flex items-start gap-3">
              <button
                onClick={() => onSeek(s.start_seconds)}
                className={cx("flex min-w-0 flex-1 gap-4 rounded-r-lg text-left", compact ? "py-1.5" : "py-2.5")}
              >
                <span aria-hidden className={cx("w-[2px] shrink-0 rounded-full", isActive ? "bg-ink" : isCited ? "bg-[#c79a6b]" : "bg-line-strong")} />
                <span className="min-w-0">
                  <span className="block tabular-nums text-[12px] text-faint">
                    {formatTimestamp(s.start_seconds)}
                    {s.speaker ? ` · ${s.speaker}` : ""}
                  </span>
                  <span
                    className={cx(
                      "mt-0.5 block leading-relaxed transition-colors",
                      compact ? "text-[14px]" : "text-[17px]",
                      isActive ? "text-ink" : isCited ? "text-ink" : isFuture ? "text-faint" : "text-muted",
                    )}
                  >
                    {isActive ? <SpokenWords text={s.text} progress={(time - s.start_seconds) / Math.max(0.01, s.end_seconds - s.start_seconds)} /> : s.text}
                  </span>
                </span>
              </button>
              <div className="flex w-[64px] shrink-0 flex-wrap justify-end gap-1 pt-2.5">
                {flags.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => onSelectObs(o)}
                    title={o.description}
                    aria-label={o.modality === "reviewer" ? "Show annotation" : "Show observation"}
                    className={cx("grid h-7 w-7 place-items-center rounded-full", o.modality === "reviewer" ? TONE.human.pill : TONE.ai.pill, o.id === selectedObs && "ring-2 ring-line-strong ring-offset-1")}
                  >
                    <Icon name="flag" size={13} />
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The line being spoken, filled in word by word. Timing within a line is
 * estimated evenly from its start and end, since the transcript has no
 * per-word timestamps.
 */
function SpokenWords({ text, progress }: { text: string; progress: number }) {
  const parts = text.split(/(\s+)/);
  const words = parts.filter((p) => p.trim()).length;
  const spoken = Math.min(words, Math.floor(Math.max(0, progress) * words) + 1);
  let seen = 0;
  return (
    <>
      {parts.map((p, i) => {
        if (!p.trim()) return p;
        seen++;
        return (
          <span key={i} className={cx("transition-colors duration-150", seen <= spoken ? "text-ink" : "text-ink")}>
            {p}
          </span>
        );
      })}
    </>
  );
}
