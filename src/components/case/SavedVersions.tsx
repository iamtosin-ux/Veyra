"use client";

import Link from "next/link";
import { timeAgo, useApi } from "@/lib/client";
import { Icon } from "../Icon";

interface Version {
  id: string;
  version: number;
  generated_at: string;
  approved_at: string | null;
}

/** Every saved version of the case pack and when it was saved. Opening one shows that case file. */
export function SavedVersions({ caseId }: { caseId: string }) {
  const { data } = useApi<{ versions: Version[] }>(`/api/cases/${caseId}/pack/versions`, { pollMs: 30000 });
  const versions = data?.versions ?? [];
  if (data && versions.length === 0) return <p className="px-5 py-6 text-[13px] text-muted">No versions yet.</p>;
  return (
    <ul className="scroll-panel h-full px-3 py-2">
      {versions.map((v) => (
        <li key={v.id}>
          <Link href={`/cases/${caseId}/file/${v.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-subtle">
            <span className="min-w-0 flex-1 text-[13.5px]">Version {v.version}</span>
            {v.approved_at && <Icon name="check" size={14} className="shrink-0 text-ink" />}
            <span className="shrink-0 text-[12px] text-faint" title={new Date(v.approved_at ?? v.generated_at).toLocaleString()}>
              {v.approved_at ? `Approved ${timeAgo(v.approved_at).toLowerCase()}` : timeAgo(v.generated_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
