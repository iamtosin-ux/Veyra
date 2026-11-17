"use client";

import { Precedents, type PrecedentItem } from "./Precedents";
import { InsightMenu } from "./InsightMenu";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/client";
import { FINDING_TYPES, FINDING_TYPE_LABEL, REVIEW_STATUSES, type EventTime, type FindingType, type ObservationType, type ReviewStatus, type SourceReference } from "@/lib/types";
import { Button, Chip, Empty, ErrorNote, Field, Reveal, ReviewChip, SLIDE, cx, inputCls } from "../ui";
import { EvidenceViewer, type Focus } from "../EvidenceViewer";
import { VideoCitationModal, type VideoCitation } from "../VideoCitationModal";
import { SourceModal, type SourceCitation } from "../SourceModal";
import { useWidth } from "@/lib/useWidth";
import { Icon } from "../Icon";
import { Menu } from "../Menu";
import { CompareModal } from "../CompareModal";
import { evidenceIcon } from "../EvidenceModal";

interface FindingSource {
  observation_id: string;
  evidence_id: string;
  evidence_reference: string;
  evidence_filename?: string;
  evidence_type: string;
  observation_reference: string;
  observation_type: ObservationType;
  observation_description: string;
  quote: string | null;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
  event_time: EventTime | null;
}

interface Content {
  title: string;
  description: string;
  review_status: string;
  version: number;
}

export interface FindingItem {
  id: string;
  reference: string;
  title: string;
  description: string;
  finding_type: FindingType;
  relationship_explanation: string | null;
  uncertainty: { requires_review: boolean; reason: string | null };
  review_status: ReviewStatus;
  reassess_reason?: string | null;
  superseded: boolean;
  archived?: boolean;
  precedents?: PrecedentItem[];
  version: number;
  created_at: string;
  updated_at: string;
  sources: FindingSource[];
  history: { id: string; action: string; previous_content: Content | null; updated_content: Content | null; review_note: string | null; reviewed_at: string; reviewer_name: string }[];
}

/** A discrepancy citing at least two evidence items can be compared side by side. */
const canCompare = (f: FindingItem) => f.finding_type === "potential_discrepancy" && new Set(f.sources.map((s) => s.evidence_id)).size >= 2;

const TYPE_TONE_F: Record<FindingType, "neutral" | "accent" | "info" | "draft" | "danger"> = {
  observation: "neutral",
  supporting_relationship: "info",
  potential_discrepancy: "danger",
  chronological_relationship: "accent",
  missing_information: "draft",
  question: "draft",
};

export function FindingsTab({ caseId, reload, initialFinding }: { caseId: string; reload: () => void; initialFinding: string | null }) {
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [comparing, setComparing] = useState<FindingItem | null>(null);
  const { data, error, reload: reloadFindings } = useApi<{ findings: FindingItem[] }>(`/api/cases/${caseId}/findings${showSuperseded ? "?superseded=1" : ""}`);
  const [typeFilter, setTypeFilter] = useState<FindingType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [chosenId, setSelectedId] = useState<string | null>(initialFinding);
  const [chosenSource, setSource] = useState<{ findingId: string; evidenceId: string; focus: Focus; observationId: string } | null>(null);

  const findings = useMemo(() => data?.findings ?? [], [data]);
  const shown = useMemo(
    () => findings.filter((f) => (typeFilter === "all" || f.finding_type === typeFilter) && (statusFilter === "all" || f.review_status === statusFilter)),
    [findings, typeFilter, statusFilter],
  );
  const selectedId = chosenId ?? shown[0]?.id ?? null;
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const [videoModal, setVideoModal] = useState<VideoCitation | null>(null);
  const [sourceModal, setSourceModal] = useState<SourceCitation | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const wide = width >= 1024;
  const narrow = width > 0 && width < 640;
  // Narrow drawer: list first; choosing a finding shows its detail with a back button.
  const [narrowDetail, setNarrowDetail] = useState(!!initialFinding);
  const openSource = (s: FindingSource) => {
    if (!selected) return;
    setSource({ findingId: selected.id, evidenceId: s.evidence_id, observationId: s.observation_id, focus: { key: Date.now(), source_reference: s.source_reference } });
    // In a narrow panel there is no inline viewer: every citation opens full-size.
    if (!wide) {
      setSourceModal({ evidenceId: s.evidence_id, evidenceType: s.evidence_type, source_reference: s.source_reference, observationId: s.observation_id, label: s.observation_description });
      return;
    }
    // Video citations open in the full-size player with the timeline.
    if (s.evidence_type === "video") {
      setVideoModal({ evidenceId: s.evidence_id, source_reference: s.source_reference, observationId: s.observation_id, label: s.observation_description });
    }
  };

  // Selecting a finding shows its first source until the reviewer picks another citation.
  const first = selected?.sources[0];
  const source =
    chosenSource && chosenSource.findingId === selected?.id
      ? chosenSource
      : first && selected
        ? { findingId: selected.id, evidenceId: first.evidence_id, observationId: first.observation_id, focus: { key: `first-${selected.id}`, source_reference: first.source_reference } }
        : null;

  // Keyboard review: j/k to move, a to accept, r to reject.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const idx = shown.findIndex((f) => f.id === selectedId);
      if (e.key === "j" && idx < shown.length - 1) setSelectedId(shown[idx + 1].id);
      if (e.key === "k" && idx > 0) setSelectedId(shown[idx - 1].id);
      if ((e.key === "a" || e.key === "r") && selected && !selected.superseded) {
        await api(`/api/findings/${selected.id}/review`, { method: "POST", json: { action: e.key === "a" ? "accept" : "reject" } });
        void reloadFindings();
        reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedId, selected, reloadFindings, reload]);

  const counts = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, findings.filter((f) => f.review_status === s).length]));

  return (
    <div ref={rootRef} className={cx("grid h-full", narrow ? "grid-cols-1" : "grid-cols-[230px_minmax(0,1fr)] @5xl:grid-cols-[300px_minmax(0,1fr)_380px]")}>
      {videoModal && <VideoCitationModal citation={videoModal} onClose={() => setVideoModal(null)} />}
      {comparing && <CompareModal title={comparing.title} facts={comparing.sources} onClose={() => setComparing(null)} />}
      {sourceModal && <SourceModal citation={sourceModal} onClose={() => setSourceModal(null)} />}
      <aside className={cx("flex min-h-0 flex-col bg-panel", !narrow && "border-r border-line", narrow && narrowDetail && "hidden")}>
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2">
            <select className={inputCls + " min-w-0 flex-1 py-1 pl-2.5 pr-6 text-xs [background-position:right_0.5rem_center]"} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as FindingType | "all")} aria-label="Filter by finding type">
              <option value="all">Type</option>
              {FINDING_TYPES.map((t) => <option key={t} value={t}>{FINDING_TYPE_LABEL[t]}</option>)}
            </select>
            <select className={inputCls + " min-w-0 flex-1 py-1 pl-2.5 pr-6 text-xs [background-position:right_0.5rem_center]"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReviewStatus | "all")} aria-label="Filter by review status">
              <option value="all">Status</option>
              {REVIEW_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)} ({counts[s]})</option>)}
            </select>
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} /> Archived</label>
          </div>
        </div>
        {error && <div className="p-3"><ErrorNote>{error}</ErrorNote></div>}
        <ul className="scroll-panel min-h-0 flex-1 px-3 pb-3" aria-label="Findings">
          {data && shown.length === 0 && <li><Empty title="No findings">Run the cross-evidence comparison on the Analysis tab.</Empty></li>}
          {shown.map((f) => (
            <li key={f.id} className="group relative">
              {!f.superseded && (
                <InsightMenu
                  id={f.id}
                  status={f.review_status}
                  archived={f.archived}
                  onChanged={() => { void reloadFindings(); reload(); }}
                  className={cx("absolute right-2 top-2 z-10", f.id !== selectedId && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100")}
                />
              )}
              <button onClick={() => { setSelectedId(f.id); setNarrowDetail(true); }} className={cx("mb-0.5 w-full rounded-lg px-2 py-2.5 text-left", f.id === selectedId ? "bg-subtle" : "hover:bg-subtle", (f.superseded || f.archived) && "opacity-60")} aria-current={f.id === selectedId}>
                <span className="block pr-6 text-[13.5px] font-medium leading-snug">{f.title}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip tone={TYPE_TONE_F[f.finding_type]}>{FINDING_TYPE_LABEL[f.finding_type]}</Chip>
                  <ReviewChip status={f.review_status} />
                  {f.reassess_reason && <Chip tone="danger">Reassess</Chip>}
                  {f.archived && <Chip>Archived</Chip>}
                  {f.superseded && <Chip>Superseded</Chip>}
                  <SourceHint sources={f.sources} />
                  {canCompare(f) && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setComparing(f);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setComparing(f);
                        }
                      }}
                      className="inline-flex shrink-0 items-center rounded-lg border border-line bg-panel px-1.5 py-px text-[11px] font-medium text-ink hover:bg-subtle"
                    >
                      Compare evidence
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="hidden min-h-0 bg-panel @5xl:block">
        {source ? (
          <EvidenceViewer key={source.evidenceId} evidenceId={source.evidenceId} focus={source.focus} onExpandVideo={setVideoModal} />
        ) : (
          <Empty title="Select a citation">The cited evidence opens here at the exact location.</Empty>
        )}
      </section>

      <aside className={cx("scroll-panel min-h-0 bg-panel", !narrow && "border-l border-line", narrow && !narrowDetail && "hidden")}>
        {narrow && (
          <button onClick={() => setNarrowDetail(false)} className="flex items-center gap-1 px-5 pt-4 text-[12px] text-muted hover:text-ink">
            ← All findings
          </button>
        )}
        {selected ? (
          <FindingDetail
            key={selected.id + selected.version + selected.review_status}
            caseId={caseId}
            f={selected}
            activeObservation={source?.observationId ?? null}
            onSource={openSource}
            onCompare={() => setComparing(selected)}
            onChanged={() => {
              void reloadFindings();
              reload();
            }}
          />
        ) : (
          <Empty title="No finding selected" />
        )}
      </aside>
    </div>
  );
}

/** The proposed relationship, folded by default so Compare evidence stays the focus; its limitation sits inside. */
function Relationship({ explanation, limitation }: { explanation: string | null; limitation: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 rounded-xl bg-subtle">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-left text-[12px] font-medium text-muted hover:text-ink">
        <Icon name="link" size={14} className="shrink-0" />
        <span className="flex-1">Proposed relationship</span>
        <Icon name="chevron" size={14} className={cx("shrink-0 transition-transform", SLIDE, open && "rotate-90")} />
      </button>
      <Reveal open={open}>
        <div className="space-y-2.5 px-3.5 pb-3">
          {explanation && <p className="text-[13px] leading-relaxed text-ink">{explanation}</p>}
          {limitation && (
            <div className="rounded-[calc(var(--radius-xl)-4px)] bg-panel px-3 py-2.5">
              <h4 className="text-[12px] font-medium text-muted">Limitation</h4>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{limitation}</p>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}

function FindingDetail({ caseId, f, activeObservation, onSource, onCompare, onChanged }: { caseId: string; f: FindingItem; activeObservation: string | null; onSource: (s: FindingSource) => void; onCompare: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<"view" | "correct">("view");
  const [title, setTitle] = useState(f.title);
  const [description, setDescription] = useState(f.description);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: "accept" | "reject" | "correct" | "reset") => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/findings/${f.id}/review`, { method: "POST", json: { action, title, description, note: note || null } });
      setMode("view");
      setNote("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={TYPE_TONE_F[f.finding_type]}>{FINDING_TYPE_LABEL[f.finding_type]}</Chip>
        <ReviewChip status={f.review_status} />
        {f.version > 1 && <Chip tone="info">v{f.version}</Chip>}
      </div>

      {mode === "view" ? (
        <>
          <h2 className="mt-2.5 text-[15px] font-medium leading-snug">{f.title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.description}</p>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description"><textarea className={inputCls} rows={6} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      )}

      {f.reassess_reason && !f.superseded && (
        <section className="mt-3 rounded-xl bg-danger-soft px-3.5 py-3" role="note">
          <h3 className="text-[12px] font-medium text-danger">Needs reassessment</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{f.reassess_reason}</p>
        </section>
      )}

      {(f.relationship_explanation || f.uncertainty.reason) && <Relationship explanation={f.relationship_explanation} limitation={f.uncertainty.reason} />}
      {mode === "view" && canCompare(f) && (
        <button onClick={onCompare} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle">
          Compare evidence
        </button>
      )}

      <SourceButtons sources={f.sources} active={activeObservation} onSource={onSource} />

      <Precedents caseId={caseId} findingId={f.id} findingTitle={f.title} items={f.precedents ?? []} readOnly={f.superseded || f.archived} onChanged={onChanged} />

      {mode === "correct" && (
        <div className="mt-5">
          <Field label="Reviewer's note (optional)"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </div>

      {/* Always in view: decide without scrolling to the end. */}
      {!f.superseded && (
        <footer className="sticky bottom-0 flex items-center gap-2 bg-panel px-5 py-3">
          {mode === "correct" ? (
            <>
              <Button variant="ghost" onClick={() => { setMode("view"); setTitle(f.title); setDescription(f.description); }}>Cancel</Button>
              <Button variant="primary" className="ml-auto" disabled={busy} onClick={() => act("correct")}>Save review</Button>
            </>
          ) : (
            <>
              <Menu
                side="top"
                width={200}
                items={[
                  { label: "Accepted", icon: f.review_status === "accepted" ? "check" : "findings", disabled: busy || f.review_status === "accepted", onSelect: () => void act("accept") },
                  { label: "Rejected", icon: f.review_status === "rejected" ? "check" : "close", disabled: busy || f.review_status === "rejected", onSelect: () => void act("reject") },
                  { label: "Unreviewed", icon: f.review_status === "unreviewed" ? "check" : "refresh", disabled: busy || f.review_status === "unreviewed", onSelect: () => void act("reset") },
                ]}
                trigger={({ toggle, ref, open }) => (
                  <button ref={ref} onClick={toggle} aria-expanded={open} disabled={busy} className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-45">
                    Mark as <Icon name="chevron" size={14} className="-rotate-90" />
                  </button>
                )}
              />
              <Button disabled={busy} onClick={() => setMode("correct")}>Review</Button>
            </>
          )}
        </footer>
      )}
    </div>
  );
}

const EVIDENCE_LABEL: Record<string, string> = { video: "Video", audio: "Audio", image: "Image", document: "Document", written_account: "Account" };

/** One button per evidence item cited, opening its first cited moment; four shown, the rest behind See more. */
function SourceButtons({ sources, active, onSource }: { sources: FindingSource[]; active: string | null; onSource: (s: FindingSource) => void }) {
  const [all, setAll] = useState(false);
  const items = [...new Map(sources.map((s) => [s.evidence_id, s])).values()];
  const shown = all ? items : items.slice(0, 4);
  return (
    <section className="mt-5">
      <h3 className="text-[12px] font-medium text-muted">Sources</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((s) => {
          const on = sources.some((x) => x.evidence_id === s.evidence_id && x.observation_id === active);
          const name = s.evidence_filename ?? s.evidence_reference;
          return (
            <button
              key={s.evidence_id}
              onClick={() => onSource(s)}
              title={name}
              className={cx("flex h-8 max-w-full items-center gap-1.5 rounded-lg border bg-panel pl-2 pr-1.5 text-[12.5px] hover:border-line-strong", on ? "border-line-strong" : "border-line")}
            >
              <Icon name={evidenceIcon(s.evidence_type)} size={14} className="shrink-0 text-muted" />
              <span className="max-w-[150px] truncate">{name}</span>
              <span className="shrink-0 rounded-md bg-subtle px-1.5 py-px text-[11px] text-muted">{EVIDENCE_LABEL[s.evidence_type] ?? "File"}</span>
            </button>
          );
        })}
        {items.length > 4 && (
          <button onClick={() => setAll((v) => !v)} className="h-8 rounded-lg px-2 text-[12.5px] text-muted hover:bg-hover hover:text-ink">
            {all ? "See less" : `See ${items.length - 4} more`}
          </button>
        )}
      </div>
    </section>
  );
}

/** At a glance: how many files an insight came from; hover for their names and kinds. */
function SourceHint({ sources }: { sources: FindingSource[] }) {
  const files = [...new Map(sources.map((s) => [s.evidence_id, s])).values()];
  if (!files.length) return null;
  return (
    <span
      className="ml-auto min-w-0 truncate text-[12px] text-faint"
      title={files.map((s) => `${s.evidence_filename ?? s.evidence_reference} (${EVIDENCE_LABEL[s.evidence_type] ?? "File"})`).join("\n")}
    >
      {files.length === 1 ? "1 file" : `${files.length} files`}
    </span>
  );
}
