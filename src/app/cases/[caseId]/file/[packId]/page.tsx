"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/client";
import type { CasePackContent } from "@/server/casepack";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { PackDocument } from "@/components/case/CasePackTab";
import { ErrorNote } from "@/components/ui";

interface PackResponse {
  pack: { id: string; content: CasePackContent; approval: { by: string | null; at: string } | null } | null;
}

/** The generated case file for one saved version, for decision making, download or sharing. */
export default function CaseFilePage() {
  const { caseId, packId } = useParams<{ caseId: string; packId: string }>();
  const { data, error } = useApi<PackResponse>(`/api/cases/${caseId}/pack?id=${packId}`);
  const [copied, setCopied] = useState(false);
  const pack = data?.pack;
  const c = pack?.content;
  const o = c?.overview;
  const title = (c?.title ?? "").replace(/^DEMO · /, "");

  const share = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell
      breadcrumb={
        <>
          <Crumb href="/cases">Cases</Crumb>
          <Crumb href={`/cases/${caseId}`}>{title || "Case"}</Crumb>
          <Crumb current>Case file{c ? ` v${c.version}` : ""}</Crumb>
        </>
      }
      actions={
        pack && (
          <>
            <button onClick={() => void share()} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium hover:bg-subtle">
              <Icon name={copied ? "check" : "link"} size={13} /> {copied ? "Link copied" : "Share"}
            </button>
            <Menu
              align="right"
              width={200}
              items={[
                { label: "Word document (DOCX)", icon: "pack", onSelect: () => window.location.assign(`/api/cases/${caseId}/pack/export?id=${pack.id}`) },
                { label: "Print or save as PDF", icon: "files", onSelect: () => window.print() },
              ]}
              trigger={({ toggle, ref, open }) => (
                <button ref={ref} onClick={toggle} aria-expanded={open} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary-hover">
                  <Icon name="upload" size={13} className="rotate-180" /> Download
                </button>
              )}
            />
          </>
        )
      }
    >
      <div className="scroll-panel h-full bg-canvas print:bg-white">
        <div className="mx-auto max-w-4xl px-6 py-8">
          {error && <ErrorNote>{error}</ErrorNote>}
          {data && !pack && <ErrorNote>This case file could not be found.</ErrorNote>}
          {c && o && (
            <>
              {/* Decision summary */}
              <section className="rounded-2xl bg-panel p-5 shadow-[var(--shadow-card)] print:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
                      {pack.approval ? (
                        <>
                          <Icon name="check" size={13} /> Approved{pack.approval.by ? ` by ${pack.approval.by}` : ""}
                        </>
                      ) : (
                        <span className="text-draft">Draft version</span>
                      )}
                    </p>
                    <h1 className="mt-1 text-[24px] font-medium ">{title}</h1>
                    <p className="text-[12px] text-muted">
                      {c.case_reference} · Version {c.version}
                    </p>
                  </div>
                  <Link href={`/cases/${caseId}`} className="text-[13px] text-muted hover:text-ink">
                    Back to case
                  </Link>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["Evidence items", o.evidence_items],
                      ["Findings included", o.findings_included],
                      ["Potential discrepancies", c.discrepancies.length],
                      ["Open questions", c.open_questions.length],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-subtle px-3.5 py-3">
                      <dt className="text-[11px] text-muted">{l}</dt>
                      <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                {!c.include_unreviewed && (o.findings_unreviewed > 0 || o.findings_excluded_rejected > 0) && (
                  <p className="mt-3 text-[12px] text-muted">
                    Not included: {o.findings_unreviewed} unreviewed and {o.findings_excluded_rejected} rejected finding(s).
                  </p>
                )}
              </section>
              <PackDocument c={c} approval={pack.approval} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
