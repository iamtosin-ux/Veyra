"use client";

import { timeAgo, useApi } from "@/lib/client";
import type { CasePackContent } from "@/server/casepack";
import { Icon } from "../Icon";
import { ErrorNote } from "../ui";
import { PackDocument } from "./CasePackTab";

interface PackResponse {
  pack: { id: string; content: CasePackContent; generated_at?: string; approval: { by: string | null; at: string } | null } | null;
}

/** A saved version of the case pack, shown in place of the live canvas. */
export function VersionPreview({ caseId, packId, onBack }: { caseId: string; packId: string; onBack: () => void }) {
  const { data, error } = useApi<PackResponse>(`/api/cases/${caseId}/pack?id=${packId}`);
  const pack = data?.pack;
  const c = pack?.content;

  return (
    <div className="mx-auto max-w-[920px] px-6 pb-16">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-panel py-3">
        <button onClick={onBack} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-3 text-[13px] font-medium hover:bg-subtle">
          <Icon name="arrowLeft" size={15} /> Back to case
        </button>
        {c && (
          <span className="text-[13px] text-muted">
            Version {c.version}
            {pack?.generated_at ? ` · ${timeAgo(pack.generated_at).toLowerCase()}` : ""}
          </span>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !pack && <ErrorNote>This version could not be found.</ErrorNote>}
      {c && <PackDocument c={c} approval={pack?.approval} />}
    </div>
  );
}
