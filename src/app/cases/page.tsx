"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/client";
import { AppShell, Crumb } from "@/components/AppShell";
import { CasePreviewCard, CaseRow, type CaseItem } from "@/components/CaseCard";
import { Icon } from "@/components/Icon";
import { cx } from "@/components/ui";

const FILTERS = [
  ["all", "All"],
  ["review", "Needs review"],
  ["pinned", "Pinned"],
  ["samples", "Samples"],
  ["archived", "Archived"],
] as const;

export default function AllCasesPage() {
  return (
    <Suspense>
      <WithQuery />
    </Suspense>
  );
}

// A new ?q= from the sidebar search resets the page's search box.
function WithQuery() {
  const q = useSearchParams().get("q") ?? "";
  return <AllCases key={q} initial={q} />;
}

function AllCases({ initial }: { initial: string }) {
  const cases = useApi<{ cases: CaseItem[] }>("/api/cases", { pollMs: 15000 });
  const [query, setQuery] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [layout, setLayout] = useState<"cards" | "list">("cards");

  // Remember the chosen layout in this browser.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem("veyra.cases.layout") === "list") setLayout("list");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const chooseLayout = (l: "cards" | "list") => {
    setLayout(l);
    try {
      localStorage.setItem("veyra.cases.layout", l);
    } catch {}
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cases.data?.cases ?? [])
      .filter((c) => (filter === "archived" ? c.archived : !c.archived))
      .filter((c) => (filter === "review" ? c.findings_needing_review > 0 : filter === "pinned" ? c.pinned : filter === "samples" ? c.is_demo : true))
      .filter((c) => !q || `${c.title} ${c.description} ${c.summary ?? ""} ${c.reference} ${c.industry ?? ""}`.toLowerCase().includes(q));
  }, [cases.data, query, filter]);

  return (
    <AppShell
      breadcrumb={<Crumb current>Cases</Crumb>}
      actions={
        <Link href="/?new=1" className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary-hover">
          <Icon name="plus" size={13} /> New case
        </Link>
      }
    >
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[960px] px-8 pb-16 pt-10">
          <h1 className="text-[26px] font-medium ">Cases</h1>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={cx("h-8 rounded-full px-3.5 text-[13px]", filter === k ? "bg-primary text-white" : "bg-subtle text-muted hover:text-ink")}>
                {l}
              </button>
            ))}
            <div className="ml-auto flex h-8 items-center rounded-full bg-subtle p-0.5" role="group" aria-label="Layout">
              {(
                [
                  ["cards", "viewGrid", "Card view"],
                  ["list", "viewList", "List view"],
                ] as const
              ).map(([k, icon, label]) => (
                <button
                  key={k}
                  onClick={() => chooseLayout(k)}
                  aria-pressed={layout === k}
                  title={label}
                  aria-label={label}
                  className={cx("grid h-7 w-8 place-items-center rounded-full", layout === k ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink")}
                >
                  <Icon name={icon} size={15} />
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 flex h-8 w-fit items-center gap-1.5 rounded-full bg-subtle px-3 text-muted">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search cases" className="w-36 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
          </label>
          {layout === "cards" ? (
            <div className="mt-6 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
              {shown.map((c) => <CasePreviewCard key={c.id} c={c} />)}
            </div>
          ) : (
            <div className="mt-4 ">
              {shown.map((c) => <CaseRow key={c.id} c={c} />)}
            </div>
          )}
          {cases.data && shown.length === 0 && <p className="mt-4 rounded-2xl bg-subtle px-6 py-10 text-center text-[13px] text-muted">No cases match.</p>}
        </div>
      </div>
    </AppShell>
  );
}
