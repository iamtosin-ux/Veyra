"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApi } from "@/lib/client";
import type { SourceReference } from "@/lib/types";
import { AudioTranscript } from "./AudioTranscript";
import type { EvidenceDetail } from "./EvidenceViewer";
import { evidenceIcon } from "./EvidenceModal";
import { Icon } from "./Icon";
import { cx } from "./ui";

/** One cited fact: an observation and where in its evidence it comes from. */
export interface CompareFact {
  observation_id: string;
  evidence_id: string;
  evidence_type: string;
  evidence_filename?: string;
  evidence_reference: string;
  observation_description: string;
  quote: string | null;
  source_reference: SourceReference;
}

const TYPE_LABEL: Record<string, string> = { video: "Video", audio: "Audio transcript", image: "Image", document: "Document", written_account: "Written account" };
const PLAY_EVENT = "veyra:compare-play";

/**
 * Two cited evidence items side by side, each opened at the moment or passage
 * the finding relies on, so a reviewer can see the conflict for themselves.
 */
export function CompareModal({ title, facts, onClose }: { title: string; facts: CompareFact[]; onClose: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, CompareFact[]>();
    for (const f of facts) m.set(f.evidence_id, [...(m.get(f.evidence_id) ?? []), f]);
    return [...m.values()];
  }, [facts]);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(Math.min(1, groups.length - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Compare evidence" className="animate-dialog absolute inset-3 flex flex-col overflow-hidden rounded-2xl bg-panel shadow-[var(--shadow-dialog)] md:inset-6">
        <header className="flex h-13 shrink-0 items-center gap-3 px-5">
          <Icon name="compare" size={16} className="text-muted" />
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{title}</p>
          <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-x divide-line md:grid-cols-2">
          <ComparePane key={`l${left}`} groups={groups} group={left} onGroup={setLeft} />
          <ComparePane key={`r${right}`} groups={groups} group={right} onGroup={setRight} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ComparePane({ groups, group, onGroup }: { groups: CompareFact[][]; group: number; onGroup: (i: number) => void }) {
  const facts = groups[group] ?? [];
  const [i, setI] = useState(0);
  const fact = facts[i];
  const { data } = useApi<EvidenceDetail>(fact ? `/api/evidence/${fact.evidence_id}` : null);
  const media = fact?.evidence_type === "audio" || fact?.evidence_type === "video";

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-5">
        {groups.length > 2 ? (
          <select value={group} onChange={(e) => onGroup(Number(e.target.value))} aria-label="Evidence item" className="h-8 min-w-0 max-w-[60%] rounded-lg border border-line bg-panel px-2 text-[13px]">
            {groups.map((g, gi) => (
              <option key={g[0].evidence_id} value={gi}>{g[0].evidence_filename ?? g[0].evidence_reference}</option>
            ))}
          </select>
        ) : (
          <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
            <Icon name={evidenceIcon(fact?.evidence_type ?? "document")} size={15} className="shrink-0 text-muted" />
            <span className="truncate">{fact?.evidence_filename ?? fact?.evidence_reference}</span>
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button disabled={i === 0} onClick={() => setI(i - 1)} className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[12px] text-muted hover:bg-subtle hover:text-ink disabled:opacity-40">
            <Icon name="arrowLeft" size={13} /> Prev fact
          </button>
          <button disabled={i >= facts.length - 1} onClick={() => setI(i + 1)} className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[12px] text-muted hover:bg-subtle hover:text-ink disabled:opacity-40">
            Next fact <Icon name="arrowRight" size={13} />
          </button>
        </div>
      </div>

      <div className="mx-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-line">
        {!data || !fact ? (
          <p className="p-6 text-[13px] text-muted">Loading…</p>
        ) : media ? (
          <MediaFact detail={data} fact={fact} />
        ) : fact.evidence_type === "image" ? (
          <div className="grid min-h-0 flex-1 place-items-center bg-subtle p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- originals are served as-is */}
            <img src={`/api/evidence/${fact.evidence_id}/file`} alt={fact.evidence_filename ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        ) : (
          <TextFact detail={data} fact={fact} />
        )}
      </div>

      {fact && (
        <footer className="shrink-0 px-5 pb-4 pt-3">
          <p className="flex items-center gap-2 text-[12.5px]">
            <span className="truncate font-medium">{fact.evidence_filename ?? fact.evidence_reference}</span>
            <span className="shrink-0 rounded-md bg-[#f1e4f8] px-1.5 py-px text-[11px] text-[#6f2a8f]">{TYPE_LABEL[fact.evidence_type] ?? "File"}</span>
            {facts.length > 1 && <span className="shrink-0 text-faint">Fact {i + 1} of {facts.length}</span>}
          </p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted">{fact.observation_description}</p>
        </footer>
      )}
    </section>
  );
}

interface Segment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

/** Audio or video, opened at the cited moment with the transcript following along. */
function MediaFact({ detail, fact }: { detail: EvidenceDetail; fact: CompareFact }) {
  const ref = useRef<HTMLVideoElement>(null);
  const id = useId();
  const start = fact.source_reference.start_time_seconds ?? 0;
  const end = fact.source_reference.end_time_seconds ?? start;
  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>((detail.evidence.metadata.technical as { duration_seconds?: number } | undefined)?.duration_seconds ?? 0);
  const segments = ((detail.extractions.transcript?.content as { segments?: Segment[] } | null)?.segments ?? []) as Segment[];
  const observations = useMemo(() => detail.observations.filter((o) => o.source_reference.start_time_seconds != null), [detail]);

  const seek = useCallback((t: number) => {
    const v = ref.current;
    const c = Math.max(0, Math.min(t, v?.duration || t));
    if (v) v.currentTime = c;
    setTime(c);
  }, []);
  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      // Only one side plays at a time.
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
      void v.play();
    } else v.pause();
  }, [id]);

  useEffect(() => {
    const onOther = (e: Event) => (e as CustomEvent).detail !== id && ref.current?.pause();
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, [id]);

  const video = fact.evidence_type === "video";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <video
        ref={ref}
        src={`/api/evidence/${fact.evidence_id}/file`}
        preload="auto"
        className={video ? "max-h-[38%] w-full shrink-0 bg-[#0d0d0d] object-contain" : "hidden"}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.currentTime = start;
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
      />
      <AudioTranscript
        evidenceId={fact.evidence_id}
        duration={duration}
        time={time}
        playing={playing}
        segments={segments}
        observations={observations}
        selectedObs={fact.observation_id}
        onSeek={seek}
        onToggle={toggle}
        onSelectObs={(o) => seek(o.source_reference.start_time_seconds ?? 0)}
        cited={{ start, end }}
        compact
      />
    </div>
  );
}

/** Document or written account, scrolled to the cited passage with the quote marked. */
function TextFact({ detail, fact }: { detail: EvidenceDetail; fact: CompareFact }) {
  const mark = useRef<HTMLElement>(null);
  const pages = ((detail.extractions.document_text?.content as { pages?: { page_number: number; text: string }[]; text?: string } | null) ?? {}) as { pages?: { page_number: number; text: string }[]; text?: string };
  const list = pages.pages ?? (pages.text ? [{ page_number: 1, text: pages.text }] : []);
  const page = fact.source_reference.page_number ?? null;
  const quote = fact.quote?.trim() || null;

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [fact.observation_id]);

  if (!list.length) return <p className="p-6 text-[13px] text-muted">No extracted text for this item yet.</p>;
  return (
    <div className="scroll-panel min-h-0 flex-1 space-y-6 px-6 py-5">
      {list.map((p) => {
        const here = quote ? p.text.indexOf(quote) : -1;
        const onPage = page === null || page === p.page_number;
        return (
          <div key={p.page_number}>
            {list.length > 1 && <p className="mb-1.5 text-[11.5px] text-faint">Page {p.page_number}</p>}
            <p className={cx("whitespace-pre-wrap rounded-xl text-[14px] leading-relaxed", onPage && !quote && page !== null && "bg-[#eef8f4] p-2")}>
              {here >= 0 && onPage ? (
                <>
                  {p.text.slice(0, here)}
                  <mark ref={mark} className="rounded bg-[#ddf3ea] px-0.5 text-ink">{quote}</mark>
                  {p.text.slice(here + quote!.length)}
                </>
              ) : (
                p.text
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
