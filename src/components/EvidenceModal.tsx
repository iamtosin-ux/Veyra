"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useApi } from "@/lib/client";
import { EvidenceViewer, type EvidenceDetail } from "./EvidenceViewer";
import { EvidenceFindings } from "./EvidenceFindings";
import { EvidenceActions } from "./EvidenceActions";
import { EvidenceDetailsPanel } from "./EvidenceDrawer";
import { Icon, type IconName } from "./Icon";
import { VideoCitationModal } from "./VideoCitationModal";
import type { EvidenceItem } from "./case/types";

const TYPE_ICON: Record<string, IconName> = { video: "film", audio: "mic", image: "image", document: "pdf", written_account: "text" };

/** An icon for the kind of media: film, microphone, image, PDF, Word, spreadsheet, slides or text. The filename refines documents. */
export function evidenceIcon(type: string, filename?: string): IconName {
  if (type === "document" && filename) {
    if (/\.(docx?|odt|rtf)$/i.test(filename)) return "word";
    if (/\.(xlsx?|ods|csv)$/i.test(filename)) return "sheet";
    if (/\.(pptx?|odp)$/i.test(filename)) return "slides";
    if (/\.(txt|md)$/i.test(filename)) return "text";
  }
  return TYPE_ICON[type] ?? "files";
}

/**
 * Full-screen view of one evidence item. Video and audio open the player with
 * the annotation timeline; images are shown as they are; documents open in a
 * document viewer.
 */
export function EvidenceModal({
  item,
  onClose,
  onAsk,
  onChanged,
  context = "case",
}: {
  item: EvidenceItem;
  onClose: () => void;
  onAsk?: (text: string) => void;
  onChanged: () => void;
  /** In a case: how this case reads the item. In the vault: the item and its details, since it can serve many cases. */
  context?: "case" | "vault";
}) {
  if (item.evidence_type === "video" || item.evidence_type === "audio") {
    return <VideoCitationModal citation={{ evidenceId: item.id, source_reference: {} as never }} onClose={onClose} annotate={onAsk ? { onAsk, onChanged } : undefined} mode={context} />;
  }
  return <ViewerShell item={item} onClose={onClose} onChanged={onChanged} vault={context === "vault"} />;
}

function ViewerShell({ item, onClose, onChanged, vault }: { item: EvidenceItem; onClose: () => void; onChanged: () => void; vault: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const file = `/api/evidence/${item.id}/file`;
  const isPdf = item.mime_type === "application/pdf";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={item.original_filename} className="animate-dialog absolute inset-3 flex flex-col overflow-hidden rounded-2xl bg-panel shadow-[var(--shadow-dialog)] md:inset-6">
        <header className="flex h-13 shrink-0 items-center gap-3 px-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-muted">
            <Icon name={evidenceIcon(item.evidence_type, item.original_filename)} size={15} />
          </span>
          <span className="tabular-nums text-[12px] text-muted">{item.reference}</span>
          <span className="truncate text-[13px] font-medium">{item.original_filename}</span>
          <div className="ml-auto flex items-center gap-1">
            <EvidenceActions evidenceId={item.id} status={item.processing_status} onChanged={onChanged} />
            <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-0 bg-subtle">
          {item.evidence_type === "image" ? (
            <div className="grid h-full place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- originals are served as-is */}
              <img src={file} alt={item.original_filename} className="max-h-full max-w-full rounded-lg object-contain shadow-[var(--shadow-card)]" />
            </div>
          ) : isPdf ? (
            <iframe src={file} title={item.original_filename} className="h-full w-full bg-panel" />
          ) : (
            <div className="h-full bg-panel">
              <EvidenceViewer evidenceId={item.id} bare evidenceOnly={vault} />
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-col border-l border-line">
          {vault ? (
            // Compliance, integrity, verification and history for this item, beside the item itself.
            <>
              <p className="shrink-0 px-5 pt-4 text-[13px] font-medium">Details</p>
              <EvidenceDetailsPanel item={item} onChanged={onChanged} />
            </>
          ) : (
            <CaseReading evidenceId={item.id} />
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The findings in this case that rely on a document or image. */
function CaseReading({ evidenceId }: { evidenceId: string }) {
  const { data } = useApi<EvidenceDetail>(`/api/evidence/${evidenceId}`);
  return (
    <>
      <p className="shrink-0 px-4 pb-1 pt-4 text-[13px] font-medium">Findings</p>
      <EvidenceFindings evidenceId={evidenceId} observations={data?.observations ?? []} onSelect={() => {}} />
    </>
  );
}
