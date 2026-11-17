"use client";

import { formatBytes, formatDateTime, useApi } from "@/lib/client";
import type { CasePackContent, PackEvent, PackFinding } from "@/server/casepack";
import { Button, Empty, ErrorNote, cx } from "../ui";

interface PackResponse {
  pack: { id: string; content: CasePackContent; stale_reasons: string[] } | null;
}

export function CasePackTab({ caseId }: { caseId: string }) {
  const { data, error } = useApi<PackResponse>(`/api/cases/${caseId}/pack`);
  const pack = data?.pack;
  const c = pack?.content;

  return (
    <div className="scroll-panel h-full">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4">
          <div>
            <h2 className="text-[15px] font-semibold">Case preparation pack</h2>
            <p className="text-xs text-muted">
              Saved automatically whenever the pack changes{pack ? ` · latest v${pack.content.version}, ${formatDateTime(pack.content.generated_at)}` : ""}.
            </p>
          </div>
          {pack && (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/cases/${caseId}/pack/export?id=${pack.id}`} className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-panel px-3 text-[13px] font-medium hover:bg-subtle">Export DOCX</a>
              <a href={`/api/cases/${caseId}/pack/export?reviewed=1`} title="Accepted and corrected findings only" className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-panel px-3 text-[13px] font-medium hover:bg-subtle">Export reviewed only</a>
              <Button size="sm" onClick={() => window.print()}>Print / PDF</Button>
            </div>
          )}
        </div>
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {data && !pack && <Empty title="No versions yet">The first version is saved as soon as the case has content.</Empty>}
        {c && <PackDocument c={c} />}
      </div>
    </div>
  );
}

export function PackDocument({ c, approval }: { c: CasePackContent; approval?: { by: string | null; at: string } | null }) {
  return (
    <article className="mt-6 rounded-lg border border-line bg-panel px-10 py-10 font-doc print:border-0 print:px-0">
      <p className={cx("mb-6 inline-block rounded px-2 py-0.5 font-sans text-xs font-medium", c.include_unreviewed ? "bg-draft-soft text-draft" : "bg-ok-soft text-ok")}>
        {approval ? `Approved${approval.by ? ` by ${approval.by}` : ""} · ${formatDateTime(approval.at)}` : c.draft_status}
      </p>
      <h1 className="text-3xl">Case preparation pack</h1>
      <p className="mt-1 text-lg">{c.case_reference} · {c.title}</p>
      <p className="mt-1 font-sans text-xs text-muted">Version {c.version} · generated {formatDateTime(c.generated_at)} by {c.generated_by}</p>
      <p className="mt-4 border-l-2 border-line-strong pl-3 font-sans text-xs text-muted">{c.notice}</p>

      <H>1. Case overview</H>
      {c.description && <p className="text-[15px]">{c.description}</p>}
      <p className="mt-2 font-sans text-sm text-muted">
        Status: {c.overview.case_status} · {c.overview.evidence_items} evidence items · {c.overview.findings_included} findings included · {c.overview.findings_excluded_rejected} rejected (excluded) · {c.overview.findings_unreviewed} still unreviewed
      </p>

      <H>2. Evidence inventory</H>
      <table className="w-full font-sans text-xs">
        <thead className="text-left text-muted"><tr className=""><th className="py-1.5">Ref</th><th>Filename</th><th>Type</th><th>Size</th><th>Uploaded</th><th>SHA-256</th></tr></thead>
        <tbody>
          {c.evidence_inventory.map((e) => (
            <tr key={e.reference} className="">
              <td className="py-1.5 tabular-nums">{e.reference}</td>
              <td>{e.filename}{e.duplicate_of && <span className="text-draft"> (identical to {e.duplicate_of})</span>}</td>
              <td>{e.type.replace("_", " ")}</td>
              <td>{formatBytes(e.size_bytes)}</td>
              <td>{formatDateTime(e.uploaded_at)}</td>
              <td className="tabular-nums text-faint">{e.hash.slice(0, 12)}…</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Section title="3. Summary of reviewed findings" items={c.reviewed_findings} />
      <H>4. Chronology of events</H>
      {c.chronology.length === 0 ? <None /> : <ol className="space-y-2">{c.chronology.map((e, i) => <EventLine key={i} e={e} />)}</ol>}
      <h3 className="mt-5 text-base font-semibold">Undated events</h3>
      {c.undated_events.length === 0 ? <None /> : <ol className="space-y-2">{c.undated_events.map((e, i) => <EventLine key={i} e={e} />)}</ol>}
      <Section title="5. Cross-evidence observations" items={c.cross_evidence} />
      <Section title="6. Potential discrepancies" items={c.discrepancies} />
      <Section title="7. Missing information and unresolved questions" items={c.open_questions} />
      <h3 className="mt-6 text-base font-semibold">Information provided by the reviewer</h3>
      {(c.reviewer_notes ?? []).length === 0 ? <None /> : (
        <ul className="space-y-2">
          {(c.reviewer_notes ?? []).map((n) => (
            <li key={n.reference} className="text-[15px]">
              {n.text}
              <p className="font-sans text-[11px] text-muted">{n.reference} · {n.author ?? "Reviewer"} · {formatDateTime(n.added_at)}</p>
            </li>
          ))}
        </ul>
      )}
      {(c.web_sources ?? []).length > 0 && (
        <>
          <h3 className="mt-6 text-base font-semibold">Web sources (not evidence)</h3>
          <ul className="space-y-2">
            {(c.web_sources ?? []).map((w) => (
              <li key={w.url} className="text-[15px]">
                <a href={w.url} target="_blank" rel="noreferrer noopener" className="underline">{w.title}</a>
                {w.excerpt && <p className="font-sans text-[13px] text-ink">{w.excerpt}</p>}
                <p className="font-sans text-[11px] text-muted">For {w.section} · retrieved {formatDateTime(w.retrieved_at)}{w.approved_by ? ` · approved by ${w.approved_by}` : ""}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <H>8. Source references</H>
      <ul className="space-y-2 font-sans text-xs">
        {c.source_references.map((s) => (
          <li key={s.observation}>
            <span className="tabular-nums font-medium">{s.observation}</span> · <span className="tabular-nums">{s.citation}</span>
            <p className="text-muted">{s.description}</p>
            {s.quote && <p className="text-ink">“{s.quote}”</p>}
          </li>
        ))}
      </ul>
    </article>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 mt-8 pb-1 text-xl">{children}</h2>;
const None = () => <p className="font-sans text-sm text-faint">None included.</p>;

function Section({ title, items }: { title: string; items: PackFinding[] }) {
  return (
    <>
      <H>{title}</H>
      {items.length === 0 ? (
        <None />
      ) : (
        <div className="space-y-5">
          {items.map((f) => (
            <section key={f.reference}>
              <h3 className="text-base font-semibold">{f.reference} · {f.title}</h3>
              <p className={cx("font-sans text-xs", f.review_status === "unreviewed" ? "font-semibold text-draft" : "text-muted")}>{f.type_label} · {f.status_label}</p>
              <p className="mt-1 text-[15px] leading-relaxed">{f.description}</p>
              {f.relationship_explanation && <p className="mt-1 text-sm text-ink">Relationship: {f.relationship_explanation}</p>}
              {f.limitations && <p className="mt-1 text-sm text-ink">Limitations: {f.limitations}</p>}
              <p className="mt-1 tabular-nums text-[11px] text-muted">Sources: {f.citations.join("; ")}</p>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function EventLine({ e }: { e: PackEvent }) {
  return (
    <li className="text-[15px]">
      <span className="font-semibold tabular-nums">{e.when}</span> <span className="font-sans text-xs text-muted">({e.precision})</span> · {e.description}
      <p className={cx("font-sans text-[11px]", e.status_label.startsWith("UNREVIEWED") ? "text-draft" : "text-muted")}>{e.status_label} · {e.citations.join("; ")}</p>
      {e.note && <p className="font-sans text-xs text-draft">{e.note}</p>}
    </li>
  );
}
