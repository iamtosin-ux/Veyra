"use client";

import { useState } from "react";
import { useApi } from "@/lib/client";
import { Icon } from "../Icon";
import { cx } from "../ui";

interface Version {
  id: string;
  version: number;
  generated_at: string;
}

/**
 * A change to the case pack, posted in the chat. Clicking it shows the canvas as
 * it was at that version; Details lists each change.
 */
export function PackUpdateCard({ caseId, changes, at, onPreview }: { caseId: string; changes: string[]; at: string; onPreview: (packId: string) => void }) {
  const [open, setOpen] = useState(false);
  const versions = useApi<{ versions: Version[] }>(`/api/cases/${caseId}/pack/versions`);
  // The newest version saved by the time of this message.
  const version = versions.data?.versions.find((v) => v.generated_at <= at) ?? versions.data?.versions.at(-1);
  const title = changes.length === 1 ? changes[0] : `${changes[0]} and ${changes.length - 1} more`;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-subtle p-1">
      <button
        onClick={() => version && onPreview(version.id)}
        disabled={!version}
        aria-label={version ? `Show version ${version.version} on the canvas` : undefined}
        className="block w-full rounded-[calc(var(--radius-2xl)-4px)] bg-panel px-3.5 py-3 text-left shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-shadow hover:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--color-line-strong)] disabled:cursor-default"
      >
        <p className="text-[14px] font-medium leading-snug">{title}</p>
        {version && <p className="mt-0.5 text-[12px] text-faint">Version {version.version}</p>}
      </button>

      {open && (
        <ol className="mt-1 space-y-1.5 rounded-[calc(var(--radius-2xl)-4px)] bg-panel px-3.5 py-3" aria-label="Changes in this version">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink">
              <Icon name="checkFill" size={16} className="mt-px shrink-0 text-ink" />
              <span className="min-w-0">{c}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-1 flex">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cx("flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-medium hover:bg-panel", open && "bg-panel")}
        >
          Details
          <Icon name="chevron" size={14} className={cx("text-muted transition-transform", open ? "-rotate-90" : "rotate-90")} />
        </button>
      </div>
    </div>
  );
}
