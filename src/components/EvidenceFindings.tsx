"use client";

import { useParams } from "next/navigation";
import { useApi } from "@/lib/client";
import { FINDING_TYPE_LABEL } from "@/lib/types";
import type { FindingItem } from "./case/FindingsTab";
import type { ObservationItem } from "./Observations";
import { cx } from "./ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: "Accepted", cls: "text-muted" },
  rejected: { label: "Rejected", cls: "text-danger" },
  unreviewed: { label: "Unreviewed", cls: "text-muted" },
};

/** Findings in the open case that rely on this evidence item, each linked to the moments it cites. */
export function EvidenceFindings({ evidenceId, observations, onSelect }: { evidenceId: string; observations: ObservationItem[]; onSelect: (o: ObservationItem) => void }) {
  const { caseId } = useParams<{ caseId?: string }>();
  const { data } = useApi<{ findings: FindingItem[] }>(caseId ? `/api/cases/${caseId}/findings` : null);
  const byId = new Map(observations.map((o) => [o.id, o]));
  const list = (data?.findings ?? []).filter((f) => f.sources.some((s) => s.evidence_id === evidenceId));

  if (!data) return <p className="px-4 py-3 text-[13px] text-muted">Loading…</p>;
  if (!list.length) return <p className="px-4 py-3 text-[13px] text-faint">No findings in this case rely on this item yet.</p>;
  return (
    <ul className="scroll-panel min-h-0 flex-1 px-4 pb-3">
      {list.map((f) => {
        const status = STATUS[f.review_status] ?? STATUS.unreviewed;
        const cites = f.sources.filter((s) => s.evidence_id === evidenceId);
        return (
          <li key={f.id} className="py-3">
            <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
              <span>{FINDING_TYPE_LABEL[f.finding_type]}</span>
              <span className={cx("ml-auto text-[12px]", status.cls)}>{status.label}</span>
            </p>
            <p className="mt-1 text-[13.5px] font-medium leading-snug">{f.title}</p>
            <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-muted">{f.description}</p>
            {cites.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cites.map((s) => {
                  const o = byId.get(s.observation_id);
                  return (
                    <button
                      key={s.observation_id}
                      disabled={!o}
                      onClick={() => o && onSelect(o)}
                      title={s.observation_description}
                      className="max-w-full truncate rounded-lg border border-line px-2 py-0.5 text-[11.5px] text-muted hover:border-line-strong hover:text-ink disabled:hover:border-line disabled:hover:text-muted"
                    >
                      {s.observation_description}
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
