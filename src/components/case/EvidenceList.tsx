"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes, formatDateTime, useApi } from "@/lib/client";
import { Icon } from "../Icon";
import { ComplianceChip, IntegrityBadge, type IntegrityReport, type IntegrityReview } from "../Integrity";
import { EvidenceDrawer } from "../EvidenceDrawer";
import { evidenceIcon } from "../EvidenceModal";
import { ProcessingChip, cx } from "../ui";
import type { CaseData, EvidenceItem } from "./types";

const TYPE_LABEL: Record<string, string> = { video: "Video", image: "Image", audio: "Audio", document: "Document", written_account: "Written account" };

/**
 * Evidence card for the right-hand column: every file on the case, with + to
 * add more. The column makes room for it rather than covering the case pack.
 */
export function EvidenceList({ data, highlight, reload, onOpen, onClose }: { data: CaseData; highlight: string | null; reload: () => void; onOpen: (e: EvidenceItem) => void; onClose?: () => void }) {
  const caseId = data.case.id;
  const integrity = useApi<{ reports: Record<string, IntegrityReport>; reviews: Record<string, IntegrityReview> }>(`/api/cases/${caseId}/integrity`, { pollMs: 20000 });
  const [flagged, setFlagged] = useState<string | null>(null);
  const flaggedItem = data.evidence.find((e) => e.id === flagged);
  const flaggedReport = flagged ? integrity.data?.reports[flagged] : undefined;
  const items = [...data.evidence].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const upload = async (files: File[]) => {
    for (const [i, f] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append("files", f);
      await fetch(`/api/cases/${caseId}/evidence`, { method: "POST", body: fd }).catch(() => null);
    }
    setUploading(null);
    reload();
  };

  return (
    <section aria-label="Evidence list" className="flex h-full flex-col px-5">
      <Group label="Evidence" count={items.length} addLabel="Add evidence" onAdd={() => fileRef.current?.click()} note={uploading} onClose={onClose} />
      <div className="scroll-panel -mx-2 min-h-0 flex-1 px-2 pb-3">
        {items.length === 0 ? (
          <p className="pb-2 text-[13px] text-muted">No evidence yet.</p>
        ) : (
          <ul>
            {items.map((e) => (
              <Row
                key={e.id}
                e={e}
                report={integrity.data?.reports[e.id]}
                review={integrity.data?.reviews[e.id]}
                active={e.id === highlight}
                rowRef={e.id === highlight ? rowRef : undefined}
                onOpen={() => onOpen(e)}
                onFlag={() => setFlagged(e.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {flaggedItem && (
        <EvidenceDrawer
          key={flaggedItem.id}
          item={flaggedItem}
          report={flaggedReport}
          review={integrity.data?.reviews[flaggedItem.id]}
          onClose={() => setFlagged(null)}
          onChanged={() => {
            void integrity.reload();
            reload();
          }}
        />
      )}
    </section>
  );
}

function Group({ label, count, addLabel, onAdd, note, onClose }: { label: string; count?: number; addLabel: string; onAdd: () => void; note?: string | null; onClose?: () => void }) {
  return (
    <div className="-mr-2 flex h-14 shrink-0 items-center gap-0.5">
      <p className="text-[14px] text-ink">
        {label}
        {count != null && <span className="text-muted"> · {count}</span>}
      </p>
      {note && <span className="ml-2 truncate text-[12px] text-muted">{note}</span>}
      <button onClick={onAdd} title={addLabel} aria-label={addLabel} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
        <Icon name="plus" size={18} />
      </button>
      {onClose && (
        <button onClick={onClose} title="Close" aria-label="Close panel" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}

function Row({ e, report, review, active, rowRef, onOpen, onFlag }: { e: EvidenceItem; report?: IntegrityReport; review?: IntegrityReview; active: boolean; rowRef?: React.Ref<HTMLLIElement>; onOpen: () => void; onFlag: () => void }) {
  const m = e.metadata as { upload_source?: string; contributor_name?: string | null };
  const from = m.upload_source === "invite" ? `From ${m.contributor_name || "invited contributor"}` : m.upload_source === "chat" ? "Note from chat" : null;
  const busy = e.processing_status === "queued" || e.processing_status === "processing";
  return (
    <li ref={rowRef} className={cx("-mx-2 flex w-[calc(100%+1rem)] items-center rounded-lg pr-1 hover:bg-subtle", active && "bg-accent-soft")}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
          <Icon name={evidenceIcon(e.evidence_type)} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px]">{e.original_filename}</span>
          <span className="block truncate text-[12px] text-faint">
            {TYPE_LABEL[e.evidence_type] ?? "File"} · {formatBytes(e.file_size)} · {formatDateTime(e.uploaded_at)}
            {from ? ` · ${from}` : ""}
          </span>
        </span>
        {(busy || e.processing_status === "failed") && <ProcessingChip status={e.processing_status} />}
      </button>
      <ComplianceChip status={e.compliance_status} onOpen={onFlag} />
      <IntegrityBadge report={report} review={review} onOpen={onFlag} />
    </li>
  );
}
