"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SourceReference } from "@/lib/types";
import { EvidenceViewer } from "./EvidenceViewer";
import { VideoCitationModal } from "./VideoCitationModal";
import { Icon } from "./Icon";

export interface SourceCitation {
  evidenceId: string;
  evidenceType?: string;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
  observationId?: string;
  label?: string;
}

/** Opens any cited source full-size: video gets the timeline player, everything else the evidence viewer. */
export function SourceModal({ citation, onClose }: { citation: SourceCitation; onClose: () => void }) {
  // Audio and video always open the timeline player, where observations can be read and annotations added.
  if (citation.evidenceType === "video" || citation.evidenceType === "audio" || citation.source_reference.start_time_seconds != null) {
    return <VideoCitationModal citation={citation} onClose={onClose} />;
  }
  return <DocumentDialog citation={citation} onClose={onClose} />;
}

function DocumentDialog({ citation, onClose }: { citation: SourceCitation; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Cited source"
        className="animate-dialog absolute inset-3 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-panel shadow-[var(--shadow-dialog)] outline-none md:inset-y-6"
      >
        <div className="min-h-0 flex-1">
          <EvidenceViewer
            evidenceId={citation.evidenceId}
            focus={{ key: `modal-${citation.observationId ?? ""}`, source_reference: citation.source_reference }}
            trailing={
              <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                <Icon name="close" size={16} />
              </button>
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
