"use client";

import { useState } from "react";
import { OBSERVATION_TYPES, OBSERVATION_TYPE_LABEL, formatCitation, type EventTime, type ObservationType, type SourceReference } from "@/lib/types";
import { Chip, Empty, ReviewChip, cx } from "./ui";

export interface ObservationItem {
  id: string;
  reference: string;
  evidence_id: string;
  evidence_reference: string;
  modality: string;
  observation_type: ObservationType;
  description: string;
  quote: string | null;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
  event_time: EventTime | null;
  uncertainty: { requires_review: boolean; reason: string | null; speaker_label?: string | null; validation_notes?: string[] };
  findings: { finding_id: string; reference: string; title: string; review_status: string }[];
  analysis_run_id: string;
}

export const TYPE_TONE: Record<ObservationType, "neutral" | "accent" | "info" | "draft" | "danger"> = {
  direct_observation: "accent",
  contributor_statement: "info",
  extracted_document_fact: "neutral",
  ai_inference: "draft",
  potential_discrepancy: "danger",
  unresolved_question: "neutral",
};

export function ObservationCard({
  o,
  active,
  onCite,
  onFinding,
}: {
  o: ObservationItem;
  active?: boolean;
  onCite?: (o: ObservationItem) => void;
  onFinding?: (findingId: string) => void;
}) {
  return (
    <li className={cx("rounded-md border bg-panel p-3", active ? "border-accent/50 ring-2 ring-accent/10" : "border-line")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular-nums text-[11px] text-faint">{o.reference}</span>
        <Chip tone={TYPE_TONE[o.observation_type]}>{OBSERVATION_TYPE_LABEL[o.observation_type]}</Chip>
        {o.uncertainty.requires_review && <Chip tone="draft" title={o.uncertainty.reason ?? undefined}>Uncertain</Chip>}
      </div>
      <p className="mt-1.5 text-sm leading-snug">{o.description}</p>
      {o.quote && <blockquote className="mt-1.5 border-l-2 border-line-strong pl-2 font-doc text-[13px] text-ink">“{o.quote}”</blockquote>}
      {o.uncertainty.speaker_label && <p className="mt-1 text-xs text-muted">Speaker: {o.uncertainty.speaker_label} (label, not a verified identity)</p>}
      {o.event_time && (
        <p className="mt-1 text-xs text-muted">
          Time stated: {o.event_time.stated_text ?? o.event_time.iso_datetime} {o.event_time.basis && <span className="text-faint">({o.event_time.basis})</span>}
        </p>
      )}
      {o.uncertainty.reason && <p className="mt-1 text-xs text-draft">{o.uncertainty.reason}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onCite && (
          <button onClick={() => onCite(o)} className="rounded border border-line px-1.5 py-0.5 tabular-nums text-[11px] text-accent hover:bg-accent-soft" title="Show this location in the evidence">
            ↗ {formatCitation(o.evidence_reference, o.source_reference)}
          </button>
        )}
        {o.source_reference.precision === "approximate" && <span className="text-[11px] text-faint">approximate location</span>}
        {o.findings.map((f) => (
          <button key={f.finding_id} onClick={() => onFinding?.(f.finding_id)} className="text-[11px] text-muted underline-offset-2 hover:underline">
            {f.reference}
          </button>
        ))}
      </div>
      {o.uncertainty.validation_notes && o.uncertainty.validation_notes.length > 0 && (
        <p className="mt-1 text-[11px] text-faint">System: {o.uncertainty.validation_notes.join("; ")}</p>
      )}
    </li>
  );
}

export function ObservationList({
  observations,
  activeId,
  onCite,
  onFinding,
}: {
  observations: ObservationItem[];
  activeId?: string | null;
  onCite?: (o: ObservationItem) => void;
  onFinding?: (findingId: string) => void;
}) {
  const [type, setType] = useState<ObservationType | "all">("all");
  const shown = type === "all" ? observations : observations.filter((o) => o.observation_type === type);
  return (
    <div>
      <div className="flex flex-wrap gap-1 pb-3">
        {(["all", ...OBSERVATION_TYPES] as const).map((t) => {
          const n = t === "all" ? observations.length : observations.filter((o) => o.observation_type === t).length;
          if (t !== "all" && n === 0) return null;
          return (
            <button key={t} onClick={() => setType(t)} className={cx("rounded px-2 py-0.5 text-[11px]", type === t ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink")}>
              {t === "all" ? "All" : OBSERVATION_TYPE_LABEL[t]} {n}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <Empty title="No observations">Analyse this evidence to extract source-linked observations.</Empty>
      ) : (
        <ul className="space-y-2">
          {shown.map((o) => (
            <ObservationCard key={o.id} o={o} active={o.id === activeId} onCite={onCite} onFinding={onFinding} />
          ))}
        </ul>
      )}
    </div>
  );
}

export { ReviewChip };
