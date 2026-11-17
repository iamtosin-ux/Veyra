"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { IntegrityBadge, type IntegrityReport } from "../Integrity";
import { Button, Empty, ErrorNote, Field, ProcessingChip, cx, inputCls } from "../ui";
import { EvidenceViewer, type Focus } from "../EvidenceViewer";
import { useWidth } from "@/lib/useWidth";
import { ObservationList, type ObservationItem } from "../Observations";
import { VideoCitationModal, type VideoCitation } from "../VideoCitationModal";
import { AddFromVaultModal } from "../AddFromVaultModal";
import { VaultOfferCard } from "../VaultOffer";
import { toast } from "@/lib/toast";
import type { CaseData, EvidenceItem } from "./types";

const ACCEPT = ".mp4,.mov,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.csv,.md,.txt";
const TYPE_LABEL: Record<string, string> = { video: "Video", image: "Image", audio: "Audio", document: "Document", written_account: "Written account" };
const TYPE_ICON: Record<string, string> = { video: "▶", image: "◧", audio: "♪", document: "▤", written_account: "✎" };

interface UploadRow {
  name: string;
  state: "uploading" | "ok" | "error";
  message?: string;
}

export function EvidenceTab({ data, reload, initialEvidence }: { data: CaseData; reload: () => void; initialEvidence: string | null }) {
  const router = useRouter();
  const [chosen, setSelected] = useState<string | null>(initialEvidence);
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const narrow = width > 0 && width < 640;
  const [narrowDetail, setNarrowDetail] = useState(!!initialEvidence);
  const selected = chosen ?? data.evidence[0]?.id ?? null;
  const [focus, setFocus] = useState<Focus | null>(null);
  const [activeObs, setActiveObs] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<VideoCitation | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const anyBusy = data.evidence.some((e) => e.processing_status === "queued" || e.processing_status === "processing");
  const obsApi = useApi<{ observations: ObservationItem[] }>(`/api/cases/${data.case.id}/observations`, { pollMs: anyBusy ? 4000 : false });
  const integrity = useApi<{ reports: Record<string, IntegrityReport> }>(`/api/cases/${data.case.id}/integrity`, { pollMs: 20000 });
  const prevBusy = useRef(anyBusy);
  useEffect(() => {
    if (prevBusy.current && !anyBusy) void obsApi.reload();
    prevBusy.current = anyBusy;
  }, [anyBusy, obsApi]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const obsText = new Map<string, string>();
    for (const o of obsApi.data?.observations ?? []) obsText.set(o.evidence_id, (obsText.get(o.evidence_id) ?? "") + " " + o.description.toLowerCase() + " " + (o.quote ?? "").toLowerCase());
    return data.evidence.filter(
      (e) =>
        (typeFilter === "all" || e.evidence_type === typeFilter) &&
        (statusFilter === "all" || e.processing_status === statusFilter || (statusFilter === "pending" && e.processing_status === "pending")) &&
        (!needle || e.original_filename.toLowerCase().includes(needle) || e.reference.toLowerCase().includes(needle) || (obsText.get(e.id) ?? "").includes(needle)),
    );
  }, [data.evidence, typeFilter, statusFilter, q, obsApi.data]);

  const selectedObs = (obsApi.data?.observations ?? []).filter((o) => o.evidence_id === selected);
  const unprocessed = data.evidence.filter((e) => e.processing_status === "pending" || e.processing_status === "failed").length;

  const observationList = (
          <ObservationList
          observations={selectedObs}
          activeId={activeObs}
          onCite={(o) => {
            setActiveObs(o.id);
            setFocus({ key: Date.now(), source_reference: o.source_reference });
            if (o.modality === "video" && o.source_reference.start_time_seconds != null) {
              setVideoModal({ evidenceId: o.evidence_id, source_reference: o.source_reference, observationId: o.id, label: o.description });
            }
          }}
          onFinding={(fid) => router.push(`/cases/${data.case.id}?tab=findings&f=${fid}`)}
        />
  );

  return (
    <div ref={rootRef} className={cx("grid h-full", narrow ? "grid-cols-1" : "grid-cols-[220px_minmax(0,1fr)] @5xl:grid-cols-[280px_minmax(0,1fr)_340px]")}>
      {videoModal && <VideoCitationModal citation={videoModal} onClose={() => setVideoModal(null)} />}
      <aside className={cx("flex min-h-0 flex-col border-r border-line bg-panel", narrow && narrowDetail && "hidden")}>
        <Uploader caseId={data.case.id} caseTitle={data.case.title} onDone={(firstId) => { reload(); if (firstId) setSelected(firstId); }} />
        <div className="space-y-2 p-3">
          <input className={inputCls + " py-1.5"} placeholder="Search files and observations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search evidence" />
          <div className="flex gap-2">
            <select className={inputCls + " py-1 text-xs"} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
              <option value="all">All types</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={inputCls + " py-1 text-xs"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="pending">Not analysed</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
            </select>
          </div>
          {unprocessed > 0 && (
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              onClick={async () => {
                await api(`/api/cases/${data.case.id}/process`, { method: "POST" });
                reload();
              }}
            >
              Analyse {unprocessed} unprocessed item{unprocessed === 1 ? "" : "s"}
            </Button>
          )}
        </div>
        <ul className="scroll-panel min-h-0 flex-1 p-2" aria-label="Evidence library">
          {filtered.length === 0 && <li className="p-4 text-center text-xs text-faint">No evidence matches.</li>}
          {filtered.map((e) => (
            <EvidenceRow
              key={e.id}
              e={e}
              report={integrity.data?.reports[e.id]}
              active={e.id === selected}
              onClick={() => {
                setSelected(e.id);
                setNarrowDetail(true);
                setFocus(null);
                setActiveObs(null);
              }}
            />
          ))}
        </ul>
      </aside>

      <section className={cx("flex min-h-0 flex-col bg-panel/60", narrow && !narrowDetail && "hidden")}>
        {narrow && (
          <button onClick={() => setNarrowDetail(false)} className="flex shrink-0 items-center gap-1 px-4 py-2 text-left text-[12px] text-muted hover:text-ink">
            ← All evidence
          </button>
        )}
        <div className="min-h-0 flex-1">
          {selected ? (
            <EvidenceViewer key={selected} evidenceId={selected} focus={focus} onExpandVideo={setVideoModal} onChanged={() => { reload(); void obsApi.reload(); }} />
          ) : (
            <Empty title="No evidence yet">Upload video, audio, images, PDFs, DOCX or text files, or enter a written account.</Empty>
          )}
        </div>
        {/* Narrow panel: observations sit under the viewer instead of in a third column. */}
        {selected && (
          <div className="scroll-panel max-h-[42%] shrink-0 bg-canvas p-3 @5xl:hidden">
            <h2 className="mb-2 text-[12px] font-medium text-muted">Observations</h2>
            {observationList}
          </div>
        )}
      </section>

      <aside className="scroll-panel hidden min-h-0 border-l border-line bg-canvas p-4 @5xl:block">
        <h2 className="mb-3 text-[12px] font-medium text-muted">Observations {selected && `· ${data.evidence.find((e) => e.id === selected)?.reference ?? ""}`}</h2>
        <p className="mb-3 text-xs text-faint">AI-extracted drafts. Each links to its exact location in the original.</p>
        {observationList}
      </aside>
    </div>
  );
}

function EvidenceRow({ e, active, onClick, report }: { e: EvidenceItem; active: boolean; onClick: () => void; report?: IntegrityReport }) {
  return (
    <li>
      <button onClick={onClick} className={cx("mb-1 flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left", active ? "bg-accent-soft" : "hover:bg-canvas")} aria-current={active}>
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded bg-canvas text-sm text-muted ring-1 ring-line" aria-hidden>{TYPE_ICON[e.evidence_type]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{e.original_filename}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            <span>Uploaded {formatDateTime(e.uploaded_at)}</span>
            {/* Status only when something is happening or needs attention. */}
            {(e.processing_status === "queued" || e.processing_status === "processing" || e.processing_status === "failed") && <ProcessingChip status={e.processing_status} />}
            {report && (report.level === "indicator" || report.level === "strong" || report.level === "critical") && <IntegrityBadge report={report} />}
          </span>
        </span>
      </button>
    </li>
  );
}

function Uploader({ caseId, caseTitle, onDone }: { caseId: string; caseTitle: string; onDone: (firstId?: string) => void }) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [drag, setDrag] = useState(false);
  const [writing, setWriting] = useState(false);
  const [fromVault, setFromVault] = useState(false);
  // After uploading here, offer to put the new files in the vault too (as Veyra does in chat).
  const [offer, setOffer] = useState<string[]>([]);
  const vault = useApi<{ folders: { id: string; title: string; case_id: string | null }[] }>(offer.length ? "/api/vault" : null);
  const own = vault.data?.folders.find((f) => f.case_id === caseId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    setRows(files.map((f) => ({ name: f.name, state: "uploading" })));
    const uploaded: string[] = [];
    let firstId: string | undefined;
    // One request per file so each has its own status and a failure doesn't affect the others.
    await Promise.all(
      files.map(async (f, i) => {
        const fd = new FormData();
        fd.append("files", f);
        try {
          const res = await fetch(`/api/cases/${caseId}/evidence`, { method: "POST", body: fd });
          const body = await res.json();
          const r = body.results?.[0];
          if (r?.ok) {
            firstId ??= r.evidence.id;
            uploaded.push(r.evidence.id);
            setRows((prev) => prev.map((x, j) => (j === i ? { ...x, state: "ok", message: r.duplicate_of_reference ? `Stored as ${r.evidence.reference}. Identical to ${r.duplicate_of_reference} · flagged, both kept.` : `Stored as ${r.evidence.reference}` } : x)));
          } else {
            setRows((prev) => prev.map((x, j) => (j === i ? { ...x, state: "error", message: r?.error ?? body.error ?? "Upload failed" } : x)));
          }
        } catch {
          setRows((prev) => prev.map((x, j) => (j === i ? { ...x, state: "error", message: "Network error" } : x)));
        }
      }),
    );
    if (uploaded.length) setOffer(uploaded);
    onDone(firstId);
  }

  return (
    <div className="p-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={cx("rounded-md border border-dashed px-3 py-4 text-center", drag ? "border-accent bg-accent-soft" : "border-line-strong")}
      >
        <p className="text-sm font-medium">Add evidence</p>
        <p className="mt-0.5 text-[11px] text-muted">Drop files or <button className="text-accent underline" onClick={() => inputRef.current?.click()}>browse</button></p>
        <p className="mt-1 text-[11px] text-faint">MP4 MOV · JPG PNG WEBP · MP3 WAV M4A · PDF DOCX · TXT</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { if (e.target.files) void upload([...e.target.files]); e.target.value = ""; }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button className="text-xs text-accent hover:underline" onClick={() => setFromVault(true)}>+ Add from vault</button>
      </div>
      {offer.length > 0 && (
        <VaultOfferCard
          key={offer.join()}
          caseId={caseId}
          offer={{ evidenceIds: offer, status: "pending", folder: own ? { id: own.id, title: own.title } : { id: null, title: caseTitle } }}
          onDone={(added) => {
            setOffer([]);
            if (added) toast("Added to the vault");
          }}
        />
      )}
      {fromVault && <AddFromVaultModal caseId={caseId} onClose={() => setFromVault(false)} onAdded={(added) => onDone(added[0]?.id)} />}
      <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setWriting((w) => !w)}>{writing ? "Cancel written account" : "+ Enter a written account"}</button>
      {writing && <WrittenAccountForm caseId={caseId} onDone={(id) => { setWriting(false); onDone(id); }} />}
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px]">
          {rows.map((r, i) => (
            <li key={i} className={cx(r.state === "error" ? "text-danger" : r.state === "ok" ? "text-ok" : "text-muted")}>
              {r.state === "uploading" ? "⋯" : r.state === "ok" ? "✓" : "✕"} <span className="font-medium">{r.name}</span> {r.message && `· ${r.message}`}
            </li>
          ))}
          <li><button className="text-faint hover:text-ink" onClick={() => setRows([])}>Clear</button></li>
        </ul>
      )}
    </div>
  );
}

function WrittenAccountForm({ caseId, onDone }: { caseId: string; onDone: (id?: string) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api<{ result: { ok: boolean; evidence?: { id: string }; error?: string } }>(`/api/cases/${caseId}/evidence/text`, { method: "POST", json: { title, author, text } });
          if (!r.result.ok) throw new Error(r.result.error);
          onDone(r.result.evidence?.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save");
        }
      }}
    >
      <Field label="Title"><input className={inputCls + " py-1.5"} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
      <Field label="Author (as stated, optional)"><input className={inputCls + " py-1.5"} value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
      <Field label="Account text"><textarea className={inputCls} rows={6} value={text} onChange={(e) => setText(e.target.value)} required /></Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button size="sm" variant="primary">Save as evidence</Button>
    </form>
  );
}
