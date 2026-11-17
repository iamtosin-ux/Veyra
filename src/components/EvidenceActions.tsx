"use client";

import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";

const btn = "grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink";

/** Download the original and re-run analysis, side by side in an evidence header. */
export function EvidenceActions({ evidenceId, status, busy, onChanged }: { evidenceId: string; status: string; busy?: boolean; onChanged?: () => void }) {
  const label = status === "processed" ? "Re-analyse" : status === "failed" ? "Retry analysis" : "Analyse";
  return (
    <>
      <a href={`/api/evidence/${evidenceId}/file?download=1`} aria-label="Download original" className={btn}>
        <Icon name="download" size={16} />
      </a>
      {!busy && (
        <button
          onClick={async () => {
            try {
              await api(`/api/evidence/${evidenceId}/process`, { method: "POST" });
              toast(status === "processed" ? "Re-analysis started" : "Analysis started");
              onChanged?.();
            } catch (e) {
              toast(e instanceof Error ? e.message : "Could not start analysis", { tone: "danger" });
            }
          }}
          aria-label={label}
          className={btn}
        >
          <Icon name={status === "processed" ? "reanalyse" : "analyse"} size={16} />
        </button>
      )}
    </>
  );
}
