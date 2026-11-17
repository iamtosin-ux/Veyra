"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/client";
import { formatCitation, formatTimestamp, type SourceReference } from "@/lib/types";
import type { EvidenceDetail } from "./EvidenceViewer";
import type { ObservationItem } from "./Observations";
import { AudioTranscript, TONE } from "./AudioTranscript";
import { InlineAnnotate, type AnnotateAt } from "./InlineAnnotate";
import { MediaTimeline } from "./MediaTimeline";
import { LogoMark } from "./Logo";
import { EvidenceDetailsPanel } from "./EvidenceDrawer";
import { EvidenceFindings } from "./EvidenceFindings";
import { EvidenceActions } from "./EvidenceActions";
import type { EvidenceItem } from "./case/types";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { cx } from "./ui";

interface Segment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}
interface SoundEvent {
  start_seconds: number;
  end_seconds: number;
  rise_db: number;
}

export interface VideoCitation {
  evidenceId: string;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
  /** What is being cited, e.g. the observation or finding text. */
  label?: string;
  observationId?: string;
}

const RATES = [1, 1.5, 2, 0.5];

/**
 * Full-size dialog for inspecting a cited moment in a video: player, caption of
 * the cited speech, and a multi-track timeline aligned to the recording.
 */
export function VideoCitationModal({
  citation,
  onClose,
  annotate,
  mode = "case",
}: {
  citation: VideoCitation;
  onClose: () => void;
  /** Opened from the evidence list: show every annotation, let the reviewer add or remove them, and ask Veyra. */
  annotate?: { onAsk: (text: string) => void; onChanged?: () => void };
  /**
   * "case": the recording as read for this case (observations, annotations, findings).
   * "vault": the recording itself with its details, since one item can serve many cases.
   */
  mode?: "case" | "vault";
}) {
  const vault = mode === "vault";
  const { data, reload } = useApi<EvidenceDetail>(`/api/evidence/${citation.evidenceId}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<AnnotateAt | null>(null);
  const pickRef = useRef(false);
  useEffect(() => {
    pickRef.current = !!pick;
  }, [pick]);
  const [time, setTime] = useState(citation.source_reference.start_time_seconds ?? 0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [selectedObs, setSelectedObs] = useState<string | null>(citation.observationId ?? null);
  const sr = citation.source_reference;
  const isAudio = data?.evidence.evidence_type === "audio";
  const [side, setSide] = useState<"observations" | "findings">("observations");
  // Opened from a citation, "Ask Veyra" goes to the case chat the same way it does from the evidence list.
  const ann = annotate ?? {
    onAsk: (text: string) => {
      onClose();
      window.dispatchEvent(new CustomEvent("veyra:ask", { detail: text }));
    },
  };
  // Picking a moment or dragging a range on the timeline opens the add-annotation popup.
  const onPick = (p: AnnotateAt) => {
    seek(p.start);
    setPick(p);
  };

  const metaDuration = (data?.evidence.metadata.technical as { duration_seconds?: number } | undefined)?.duration_seconds ?? null;
  const duration = mediaDuration ?? metaDuration ?? 0;
  const segments = ((data?.extractions.transcript?.content as { segments?: Segment[] } | null)?.segments ?? []) as Segment[];
  const sounds = ((data?.extractions.acoustic_events?.content as { events?: SoundEvent[] } | null)?.events ?? []) as SoundEvent[];
  const frames = ((data?.extractions.frames?.content as { frames?: { id: string; t: number; file?: string }[] } | null)?.frames ?? []);
  const observations = useMemo(() => (vault ? [] : (data?.observations ?? []).filter((o) => o.source_reference.start_time_seconds != null)), [data, vault]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    const clamped = Math.max(0, Math.min(t, v?.duration || t));
    if (v) v.currentTime = clamped;
    setTime(clamped);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // Keyboard: Esc closes, Space plays/pauses, arrows step (Shift = 5 s).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // An open annotation popup takes Escape first.
        if (pickRef.current) setPick(null);
        else onClose();
      } else if (e.key === " " && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        // Space always means play/pause here, even when a timeline control has focus.
        e.preventDefault();
        if (!e.repeat) toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const v = videoRef.current;
        if (v) seek(v.currentTime + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5 : 1));
      }
    };
    // Buttons activate on Space keyup; suppress that so Space doesn't also click the focused control.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && e.target instanceof HTMLButtonElement) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp, true);
      prev?.focus?.();
    };
  }, [onClose, toggle, seek]);

  const caption = segments.find((s) => time >= s.start_seconds && time <= s.end_seconds + 0.2) ?? null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${data?.evidence.evidence_type === "audio" ? "Audio" : "Video"} evidence ${data?.evidence.reference ?? ""}`}
        className="animate-dialog absolute inset-3 flex flex-col overflow-hidden rounded-2xl bg-panel shadow-[var(--shadow-dialog)] outline-none md:inset-6"
      >
        {/* Header */}
        <header className="flex h-13 shrink-0 items-center gap-3 px-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-muted"><Icon name={data?.evidence.evidence_type === "audio" ? "volume" : "video"} size={15} /></span>
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="tabular-nums text-[12px] text-muted">{data?.evidence.reference}</span>
            <span className="text-faint">/</span>
            <span className="truncate font-medium">{data?.evidence.original_filename ?? "Loading…"}</span>
          </div>
          {sr.start_time_seconds != null && (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 tabular-nums text-[11px] font-medium text-accent">
              Cited {formatCitation("", sr).trim()}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            {data && <EvidenceActions evidenceId={citation.evidenceId} status={data.evidence.processing_status} onChanged={() => { void reload(); ann.onChanged?.(); }} />}
            <span aria-hidden className="mx-1 h-4 w-px bg-line" />
            <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px]">
          {/* Player + timeline */}
          <div className="flex min-h-0 flex-col bg-subtle">
            {isAudio && (
              <AudioTranscript
                evidenceId={citation.evidenceId}
                duration={duration}
                time={time}
                playing={playing}
                segments={segments}
                observations={observations}
                selectedObs={selectedObs}
                onSeek={seek}
                onPick={vault ? undefined : onPick}
                onToggle={toggle}
                onSelectObs={(o) => {
                  setSelectedObs(o.id);
                  seek(o.source_reference.start_time_seconds ?? 0);
                }}
                player={false}
              />
            )}
            <div className={cx("relative flex min-h-0 flex-1 items-center justify-center p-5", isAudio && "hidden")}>
              <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#0d0d0d]">
                <video
                  ref={videoRef}
                  src={`/api/evidence/${citation.evidenceId}/file`}
                  preload="auto"
                  muted={muted}
                  className="absolute inset-0 h-full w-full object-contain"
                  onLoadedMetadata={(e) => {
                    setMediaDuration(e.currentTarget.duration);
                    if (sr.start_time_seconds != null) e.currentTarget.currentTime = sr.start_time_seconds;
                  }}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={toggle}
                />
                {data?.evidence.evidence_type === "audio" && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/50">
                    <Icon name="volume" size={56} />
                  </div>
                )}
                {caption && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-8">
                    <p className="max-w-3xl rounded-lg bg-black/55 px-3 py-1.5 text-center text-[17px] font-medium leading-snug text-white">
                      <CaptionText text={caption.text} quote={sr.text_span} />
                    </p>
                  </div>
                )}
                {!playing && (
                  <button onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg hover:bg-white">
                    <Icon name="play" size={22} />
                  </button>
                )}
              </div>
            </div>
            <MediaTimeline
              evidenceId={citation.evidenceId}
              audioOnly={isAudio}
              duration={duration}
              time={time}
              playing={playing}
              rate={rate}
              muted={muted}
              citation={sr}
              segments={segments}
              sounds={sounds}
              frames={frames}
              observations={observations}
              showObservations={!vault}
              selectedObs={selectedObs}
              onSeek={seek}
              onPick={vault ? undefined : onPick}
              onToggle={toggle}
              onRate={() => {
                const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
                setRate(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              onMute={() => setMuted((m) => !m)}
              onSelectObs={(o) => {
                setSelectedObs(o.id);
                seek(o.source_reference.start_time_seconds ?? 0);
              }}
            />
          </div>

          <div className="flex min-h-0 flex-col border-l border-line">
            {vault ? (
              data && <EvidenceDetailsPanel item={data.evidence as unknown as EvidenceItem} onChanged={() => { void reload(); ann.onChanged?.(); }} />
            ) : (
              <>
                <div className="flex shrink-0 gap-1 px-3 pt-3" role="tablist" aria-label="Side panel">
                  {(
                    [
                      ["observations", `Observations${observations.length ? ` ${observations.length}` : ""}`],
                      ["findings", "Findings"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      role="tab"
                      aria-selected={side === k}
                      onClick={() => setSide(k)}
                      className={cx("h-8 rounded-full px-3.5 text-[13px]", side === k ? "bg-subtle font-medium text-ink" : "text-muted hover:text-ink")}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {side === "findings" ? (
                  <EvidenceFindings
                    evidenceId={citation.evidenceId}
                    observations={observations}
                    onSelect={(o) => {
                      setSelectedObs(o.id);
                      seek(o.source_reference.start_time_seconds ?? 0);
                    }}
                  />
                ) : (
                  <AnnotationPanel
                    filename={data?.evidence.original_filename ?? ""}
                    observations={observations}
                    selectedObs={selectedObs}
                    onSelect={(o) => {
                      setSelectedObs(o.id);
                      seek(o.source_reference.start_time_seconds ?? 0);
                    }}
                    onChanged={() => {
                      void reload();
                      ann.onChanged?.();
                    }}
                    onAsk={ann.onAsk}
                    citedObs={citation.observationId ?? null}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {pick && (
        <InlineAnnotate
          evidenceId={citation.evidenceId}
          at={pick}
          onClose={() => setPick(null)}
          onAdded={() => {
            void reload();
            ann.onChanged?.();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function CaptionText({ text, quote }: { text: string; quote: string | null }) {
  if (!quote) return <>{text}</>;
  const words = quote.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const set = new Set(words);
  return (
    <>
      {text.split(/(\s+)/).map((w, i) => {
        const key = w.toLowerCase().replace(/[^a-z0-9']/g, "");
        return key && set.has(key) ? (
          <span key={i} className="rounded bg-white px-0.5 text-black">{w}</span>
        ) : (
          <span key={i}>{w}</span>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Every annotation on the recording, with add, remove and "Ask Veyra". */
function AnnotationPanel({
  filename,
  observations,
  selectedObs,
  citedObs,
  onSelect,
  onChanged,
  onAsk,
}: {
  filename: string;
  observations: ObservationItem[];
  selectedObs: string | null;
  citedObs: string | null;
  onSelect: (o: ObservationItem) => void;
  onChanged: () => void;
  onAsk: (text: string) => void;
}) {
  const sorted = [...observations].sort((a, b) => (a.source_reference.start_time_seconds ?? 0) - (b.source_reference.start_time_seconds ?? 0));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(citedObs ? [citedObs] : []));
  const selectedRef = useRef<HTMLLIElement>(null);

  // Keep the selected (or cited) observation in view as it changes.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedObs]);

  const remove = async (o: ObservationItem) => {
    if (!window.confirm(`Remove ${o.reference}? It will no longer be used by Veyra.`)) return;
    const ok = await api(`/api/observations/${o.id}`, { method: "DELETE" }).then(() => true).catch(() => false);
    if (ok) toast(o.modality === "reviewer" ? "Annotation removed" : "Observation removed", { tone: "danger" });
    onChanged();
  };

  return (
    <aside className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 pb-2 pt-3 text-[12px] text-muted">
        <span className="ml-auto flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", TONE.ai.dot)} /> AI</span>
        <span className="flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", TONE.human.dot)} /> Annotation</span>
      </div>
      <ul className="scroll-panel min-h-0 flex-1 space-y-1.5 px-3 pb-3">
        {sorted.map((o) => {
          const human = o.modality === "reviewer";
          const open = expanded.has(o.id);
          const selected = o.id === selectedObs;
          return (
            <li key={o.id} ref={selected ? selectedRef : undefined} className={cx("rounded-xl border px-3 py-2.5", selected ? "border-line-strong bg-subtle" : "border-line")}>
              <button
                onClick={() => {
                  onSelect(o);
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.id)) next.delete(o.id);
                    else next.add(o.id);
                    return next;
                  });
                }}
                aria-expanded={open}
                className="block w-full text-left"
              >
                <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", human ? TONE.human.dot : TONE.ai.dot)} />
                  <span className="tabular-nums">{formatTimestamp(o.source_reference.start_time_seconds)}</span>
                  {o.id === citedObs && <span className="rounded-md bg-accent-soft px-1.5 py-px font-medium text-accent">Cited</span>}
                </span>
                <span className={cx("mt-1 block text-[13px] leading-snug", !open && "line-clamp-2")}>{o.description}</span>
              </button>
              {open && (
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => onAsk(`About ${o.reference} at ${formatTimestamp(o.source_reference.start_time_seconds)} in ${filename}: "${o.description}"\n\n`)}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-muted hover:bg-hover hover:text-ink"
                  >
                    <LogoMark size={13} className="text-ink" /> Ask Veyra
                  </button>
                  <button onClick={() => void remove(o)} aria-label={`Remove ${o.reference}`} title="Remove" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-danger">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {sorted.length === 0 && <li className="px-1 text-[12px] text-faint">No observations yet. Click or drag on the timeline to add an annotation.</li>}
      </ul>
    </aside>
  );
}
