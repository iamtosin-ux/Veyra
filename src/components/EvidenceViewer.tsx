"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, formatBytes, formatDateTime, useApi } from "@/lib/client";
import { formatCitation, formatTimestamp, type SourceReference } from "@/lib/types";
import { Button, Chip, ErrorNote, ProcessingChip, cx } from "./ui";
import { EvidenceActions } from "./EvidenceActions";
import type { ObservationItem } from "./Observations";
import type { VideoCitation } from "./VideoCitationModal";
import { Icon } from "./Icon";

export interface EvidenceDetail {
  evidence: {
    id: string;
    reference: string;
    original_filename: string;
    evidence_type: string;
    mime_type: string;
    file_size: number;
    file_hash: string;
    uploaded_at: string;
    processing_status: string;
    processing_error: string | null;
    duplicate_of: string | null;
    metadata: Record<string, unknown>;
  };
  extractions: Record<string, { content: unknown; quality: string; quality_note: string | null; run_id: string }>;
  observations: ObservationItem[];
  runs: { id: string; scope: string; status: string; stage: string | null; error_details: string | null; created_at: string }[];
}

interface Segment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface Focus {
  key: number | string;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
  label?: string;
}

/** Build a tolerant regex for a quote: words in order, any punctuation/whitespace between. */
function quoteRegex(quote: string): RegExp[] {
  return quote
    .split(/\.\.\.|…/)
    .map((frag) => frag.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 0)
    .map((words) => new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]+"), "i"));
}

function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  const parts = useMemo(() => {
    if (!quote) return [text];
    const out: ReactNode[] = [];
    let rest = text;
    let offset = 0;
    for (const re of quoteRegex(quote)) {
      const m = re.exec(rest);
      if (!m) continue;
      out.push(rest.slice(0, m.index));
      out.push(
        <mark key={offset + m.index} className="cite" data-cite="1">
          {m[0]}
        </mark>,
      );
      rest = rest.slice(m.index + m[0].length);
      offset += m.index + m[0].length;
    }
    out.push(rest);
    return out;
  }, [text, quote]);
  return <>{parts}</>;
}

/** `bare`: shown inside a window whose header already names the file and offers the download. */
export function EvidenceViewer({
  evidenceId,
  focus,
  onChanged,
  onExpandVideo,
  bare,
  trailing,
  evidenceOnly,
}: {
  evidenceId: string;
  focus?: Focus | null;
  onChanged?: () => void;
  onExpandVideo?: (c: VideoCitation) => void;
  bare?: boolean;
  /** Extra controls at the end of the header, e.g. a dialog's close button. */
  trailing?: ReactNode;
  /** The item alone, without the AI reading of it (the vault view). */
  evidenceOnly?: boolean;
}) {
  const { data, error, reload } = useApi<EvidenceDetail>(`/api/evidence/${evidenceId}`);
  const busy = data?.evidence.processing_status === "queued" || data?.evidence.processing_status === "processing" || data?.runs.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void reload(), 2500);
    return () => clearInterval(t);
  }, [busy, reload]);

  if (error) return <div className="p-6"><ErrorNote>{error}</ErrorNote></div>;
  if (!data) return <p className="p-6 text-sm text-muted">Loading evidence…</p>;
  const e = data.evidence;
  const fileUrl = `/api/evidence/${e.id}/file`;
  const activeRun = data.runs.find((r) => r.status === "queued" || r.status === "running");
  const lastRun = data.runs[0];

  return (
    <div className="flex h-full flex-col">
      {(!bare || activeRun || e.processing_status === "failed") && (
      <div className="px-5 py-3">
        {!bare && (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-xs text-muted">{e.reference}</span>
            <h2 className="min-w-0 truncate font-medium">{e.original_filename}</h2>
            <div className="ml-auto flex items-center gap-0.5">
              <EvidenceActions evidenceId={e.id} status={e.processing_status} busy={!!activeRun} onChanged={() => { void reload(); onChanged?.(); }} />
              {trailing && (
                <>
                  <span aria-hidden className="mx-1 h-4 w-px bg-line" />
                  {trailing}
                </>
              )}
            </div>
          </div>
        )}
        {activeRun && <p className="mt-2 text-xs text-info">● {activeRun.stage ?? "Queued"}…</p>}
        {e.processing_status === "failed" && lastRun?.error_details && (
          <div className="mt-2"><ErrorNote>Processing failed: {lastRun.error_details}. The original file is unaffected.</ErrorNote></div>
        )}
      </div>
      )}
      {focus && (
        <div className="bg-accent-soft px-5 py-2 text-xs text-accent">
          Showing citation <span className="tabular-nums">{formatCitation(e.reference, focus.source_reference)}</span>
          {focus.source_reference.precision !== "exact" && focus.source_reference.precision_note && (
            <span className="ml-2 text-muted">· {focus.source_reference.precision_note}</span>
          )}
        </div>
      )}
      <div className="scroll-panel min-h-0 flex-1">
        {e.evidence_type === "video" || e.evidence_type === "audio" ? (
          <MediaView detail={data} fileUrl={fileUrl} focus={focus} onExpand={onExpandVideo} onInspect={() => { void reload(); onChanged?.(); }} />
        ) : e.evidence_type === "image" ? (
          <ImageView fileUrl={fileUrl} focus={focus} alt={e.original_filename} />
        ) : (
          <DocumentView detail={data} fileUrl={fileUrl} focus={focus} />
        )}
        <MetadataPanel detail={data} evidenceOnly={evidenceOnly} />
      </div>
    </div>
  );
}

function MediaView({ detail, fileUrl, focus, onInspect, onExpand }: { detail: EvidenceDetail; fileUrl: string; focus?: Focus | null; onInspect: () => void; onExpand?: (c: VideoCitation) => void }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const isVideo = detail.evidence.evidence_type === "video";
  const transcript = detail.extractions.transcript;
  const segments = ((transcript?.content as { segments?: Segment[] } | null)?.segments ?? []) as Segment[];
  const frames = ((detail.extractions.frames?.content as { frames?: { id: string; t: number; file: string }[] } | null)?.frames ?? []);
  const acoustic = (detail.extractions.acoustic_events?.content as { events?: { start_seconds: number; end_seconds: number; peak_dbfs: number; rise_db: number }[] } | null)?.events ?? [];
  const sr = focus?.source_reference;
  const citedSegs = new Set(sr?.transcript_segment_ids ?? []);
  const citedFrames = sr?.frame_times ?? [];

  const seek = (t: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = t;
  };
  useEffect(() => {
    if (sr?.start_time_seconds != null) {
      const el = ref.current;
      if (!el) return;
      const go = () => {
        el.currentTime = sr.start_time_seconds!;
        el.pause();
      };
      if (el.readyState >= 1) go();
      else el.addEventListener("loadedmetadata", go, { once: true });
    }
  }, [focus?.key, sr?.start_time_seconds]);

  const inRange = (a: number, b: number) =>
    sr?.start_time_seconds != null && b >= sr.start_time_seconds - 0.01 && a <= (sr.end_time_seconds ?? sr.start_time_seconds) + 0.01;

  return (
    <div className="space-y-5 p-5">
      {isVideo ? (
        <div className="group relative">
          <video ref={ref} src={fileUrl} controls preload="metadata" className="w-full rounded-xl bg-black" onTimeUpdate={(ev) => setCurrent(ev.currentTarget.currentTime)} />
          {onExpand && (
            <button
              onClick={() => {
                ref.current?.pause();
                const base = focus?.source_reference;
                onExpand({
                  evidenceId: detail.evidence.id,
                  source_reference: base ?? { start_time_seconds: current, end_time_seconds: current, frame_times: [], page_number: null, text_span: null, image_region: null, precision: "exact", precision_note: null },
                  label: base ? undefined : `Opened at ${formatTimestamp(current)}`,
                });
              }}
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-[12px] font-medium text-white backdrop-blur hover:bg-primary-hover/70"
            >
              <Icon name="expand" size={13} /> Open full view
            </button>
          )}
        </div>
      ) : (
        <audio ref={ref} src={fileUrl} controls preload="metadata" className="w-full" onTimeUpdate={(ev) => setCurrent(ev.currentTarget.currentTime)} />
      )}
      {isVideo && detail.evidence.processing_status === "processed" && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="tabular-nums">{formatTimestamp(current)}</span>
          <Button
            size="sm"
            disabled={!!inspecting}
            onClick={async () => {
              setInspecting("Queued");
              try {
                await api(`/api/evidence/${detail.evidence.id}/inspect`, { method: "POST", json: { center: current, halfWindow: 3 } });
                onInspect();
              } finally {
                setInspecting(null);
              }
            }}
          >
            Inspect ±3 s around this point
          </Button>
          <span>Extracts frames every 0.5 s and adds new observations.</span>
        </div>
      )}
      {frames.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-medium text-muted">Frames inspected by analysis ({frames.length})</h3>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {frames.map((f) => {
              const cited = citedFrames.some((t) => Math.abs(t - f.t) < 0.3);
              return (
                <button key={f.id} onClick={() => seek(f.t)} className={cx("shrink-0 rounded border-2", cited ? "border-amber-400" : "border-transparent")} title={`Frame at ${formatTimestamp(f.t)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/evidence/${detail.evidence.id}/derived?path=${encodeURIComponent(f.file)}`} alt={`Frame at ${f.t}s`} className="h-14 w-auto rounded-sm" loading="lazy" />
                  <span className="block text-center tabular-nums text-[11px] text-muted">{formatTimestamp(f.t)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-[12px] font-medium text-muted">
          Transcript {transcript?.quality_note && <span className="normal-case tracking-normal text-faint">· {transcript.quality_note}</span>}
        </h3>
        {!transcript ? (
          <p className="text-sm text-faint">Not yet transcribed.</p>
        ) : segments.length === 0 ? (
          <p className="text-sm text-faint">No speech detected.</p>
        ) : (
          <ol className="space-y-0.5 text-sm">
            {segments.map((s) => {
              const cited = citedSegs.has(s.id) || (!!sr?.text_span && inRange(s.start_seconds, s.end_seconds));
              return (
                <li key={s.id}>
                  <button onClick={() => seek(s.start_seconds)} className={cx("flex w-full gap-3 rounded px-2 py-1 text-left hover:bg-canvas", cited && "bg-amber-50 ring-1 ring-amber-300")}>
                    <span className="w-12 shrink-0 tabular-nums text-xs text-muted">{formatTimestamp(s.start_seconds)}</span>
                    <span>{cited && sr?.text_span ? <Highlighted text={s.text} quote={sr.text_span} /> : s.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {acoustic.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-medium text-muted">Abrupt sound-level changes (signal analysis)</h3>
          <ul className="flex flex-wrap gap-1.5">
            {acoustic.map((a, i) => (
              <li key={i}>
                <button onClick={() => seek(a.start_seconds)} className={cx("rounded border border-line px-2 py-1 tabular-nums text-xs hover:bg-canvas", inRange(a.start_seconds, a.end_seconds) && "border-amber-400 bg-amber-50")}>
                  {formatTimestamp(a.start_seconds)} · +{a.rise_db.toFixed(0)} dB
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-faint">Detected from audio levels only; the cause of each sound is not identified.</p>
        </section>
      )}
    </div>
  );
}

function ImageView({ fileUrl, focus, alt }: { fileUrl: string; focus?: Focus | null; alt: string }) {
  const r = focus?.source_reference.image_region;
  return (
    <div className="p-5">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl} alt={alt} className="block max-h-[70vh] max-w-full rounded-md" />
        {r && (
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-dashed border-amber-400 bg-amber-300/15"
            style={{ left: `${r.x / 10}%`, top: `${r.y / 10}%`, width: `${r.width / 10}%`, height: `${r.height / 10}%` }}
          >
            <span className="absolute -top-5 left-0 whitespace-nowrap rounded-md bg-amber-400 px-1.5 text-[11px] font-medium leading-[1.4] text-black">Approximate region</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentView({ detail, fileUrl, focus }: { detail: EvidenceDetail; fileUrl: string; focus?: Focus | null }) {
  const isPdf = detail.evidence.mime_type === "application/pdf";
  const doc = detail.extractions.document_text;
  const pages = ((doc?.content as { pages?: { page_number: number; text: string }[] } | null)?.pages ?? []);
  // A new citation resets the view to the extracted text, where the passage is highlighted.
  const [choice, setChoice] = useState<{ mode: "text" | "original"; key: Focus["key"] | undefined } | null>(null);
  // A citation opens the extracted text, where the passage is marked; otherwise the document as it looks.
  const mode = choice && choice.key === focus?.key ? choice.mode : focus && doc ? "text" : "original";
  const plain = detail.evidence.mime_type === "text/plain";
  const setMode = (m: "text" | "original") => setChoice({ mode: m, key: focus?.key });
  const containerRef = useRef<HTMLDivElement>(null);
  const sr = focus?.source_reference;
  useEffect(() => {
    const el = containerRef.current?.querySelector("[data-cite]") ?? (sr?.page_number ? containerRef.current?.querySelector(`[data-page="${sr.page_number}"]`) : null);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus?.key, mode, sr?.page_number]);

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex rounded-md border border-line p-0.5 text-xs">
          <button className={cx("rounded px-2.5 py-1", mode === "text" ? "bg-canvas font-medium" : "text-muted")} onClick={() => setMode("text")} disabled={!doc}>
            Extracted text
          </button>
          <button className={cx("rounded px-2.5 py-1", mode === "original" ? "bg-canvas font-medium" : "text-muted")} onClick={() => setMode("original")}>
            Original
          </button>
        </div>
        {doc?.quality_note && <span className="text-xs text-draft">{doc.quality_note}</span>}
      </div>
      {mode === "text" && doc ? (
        <div ref={containerRef} className="space-y-4">
          {pages.map((p) => (
            <article key={p.page_number} data-page={p.page_number} className={cx("rounded-md border bg-panel p-5", sr?.page_number === p.page_number ? "border-amber-300" : "border-line")}>
              {isPdf && <p className="mb-2 tabular-nums text-[11px] text-faint">Page {p.page_number}</p>}
              <p className="whitespace-pre-wrap font-doc text-[15px] leading-relaxed">
                {p.text ? <Highlighted text={p.text} quote={sr?.text_span ?? null} /> : <span className="text-faint">[No text layer on this page]</span>}
              </p>
            </article>
          ))}
        </div>
      ) : isPdf ? (
        <iframe key={sr?.page_number ?? 0} title="Original PDF" src={`${fileUrl}#page=${sr?.page_number ?? 1}`} className="h-[75vh] w-full rounded-md border border-line" />
      ) : plain ? (
        <OriginalText url={fileUrl} />
      ) : (
        // Word, spreadsheets, presentations and the rest, rendered on the server. The frame runs no scripts.
        <PreviewFrame evidenceId={detail.evidence.id} name={detail.evidence.original_filename} />
      )}
    </div>
  );
}

/** The server's rendering of a document, shown inline in a frame that can run nothing. */
function PreviewFrame({ evidenceId, name }: { evidenceId: string; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/evidence/${evidenceId}/preview`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setHtml, () => setFailed(true));
  }, [evidenceId]);
  if (failed) return <ErrorNote>This document could not be shown. Download the original to open it.</ErrorNote>;
  if (html === null) return <p className="text-sm text-muted">Loading…</p>;
  return <iframe aria-label={`Preview of ${name}`} sandbox="" srcDoc={html} className="h-[75vh] w-full rounded-md border border-line bg-white" />;
}

function OriginalText({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(url).then((r) => r.text()).then(setText);
  }, [url]);
  return <pre className="whitespace-pre-wrap rounded-md border border-line bg-panel p-5 font-doc text-[15px] leading-relaxed">{text ?? "Loading…"}</pre>;
}

function MetadataPanel({ detail, evidenceOnly }: { detail: EvidenceDetail; evidenceOnly?: boolean }) {
  const e = detail.evidence;
  const m = e.metadata;
  const tech = m.technical as { duration_seconds?: number; container_creation_time?: string | null; video?: { width: number; height: number; fps: number | null } | null; audio?: { codec: string } | null } | undefined;
  const summary = detail.extractions.ai_summary?.content as { summary: string; extraction_issues: string[] } | undefined;
  return (
    <div className="space-y-4 px-5 py-4 text-sm">
      {summary && !evidenceOnly && (
        <section>
          <h3 className="mb-1 text-[12px] font-medium text-muted">AI summary (draft)</h3>
          <p className="text-ink">{summary.summary}</p>
          {summary.extraction_issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-draft">
              {summary.extraction_issues.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
        </section>
      )}
      <section>
        <h3 className="mb-1 text-[12px] font-medium text-muted">File metadata</h3>
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted">Status</dt>
          <dd className="flex items-center gap-1.5"><ProcessingChip status={e.processing_status} />{e.duplicate_of && <Chip tone="draft" title="Identical file hash to another upload">Possible duplicate</Chip>}</dd>
          <dt className="text-muted">Type</dt>
          <dd>{e.evidence_type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</dd>
          <dt className="text-muted">Size</dt>
          <dd>{formatBytes(e.file_size)}</dd>
          <dt className="text-muted">Uploaded</dt>
          <dd>{formatDateTime(e.uploaded_at)} <span className="text-faint">· upload time, not event time</span></dd>
          <dt className="text-muted">SHA-256</dt>
          <dd className="truncate tabular-nums" title={e.file_hash}>{e.file_hash}</dd>
          {tech?.duration_seconds != null && (<><dt className="text-muted">Duration</dt><dd>{formatTimestamp(tech.duration_seconds)}</dd></>)}
          {tech?.video && (<><dt className="text-muted">Video</dt><dd>{tech.video.width}×{tech.video.height} {tech.video.fps ? `@ ${tech.video.fps} fps` : ""}</dd></>)}
          {tech?.audio && (<><dt className="text-muted">Audio</dt><dd>{tech.audio.codec}</dd></>)}
          {tech && (<><dt className="text-muted">Recorded time (metadata)</dt><dd>{tech.container_creation_time ?? "Not present"} <span className="text-draft">· unverified device clock</span></dd></>)}
          {typeof m.stated_author === "string" && (<><dt className="text-muted">Author (as entered)</dt><dd>{m.stated_author}</dd></>)}
          {typeof m.pages === "number" && (<><dt className="text-muted">Pages</dt><dd>{m.pages}</dd></>)}
          <dt className="text-muted">Source</dt>
          <dd>{m.upload_source === "manual_entry" ? "Entered manually" : "File upload"}</dd>
        </dl>
      </section>
    </div>
  );
}
