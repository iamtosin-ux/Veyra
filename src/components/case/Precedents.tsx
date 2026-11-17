"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "../Icon";
import { cx, inputCls } from "../ui";

export interface PrecedentItem {
  id: string;
  citation: string | null;
  title: string;
  court: string | null;
  judgment_date: string | null;
  url: string;
}

interface Result {
  title: string;
  citation: string | null;
  court: string | null;
  date: string | null;
  url: string;
}

const year = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

/** Published judgments linked to a finding, and a search of Find Case Law (in a modal) to add more. */
export function Precedents({ caseId, findingId, findingTitle, items, readOnly, onChanged }: { caseId: string; findingId: string; findingTitle: string; items: PrecedentItem[]; readOnly?: boolean; onChanged: () => void }) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [court, setCourt] = useState("");
  const [courts, setCourts] = useState<{ code: string; label: string }[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = new Set(items.map((p) => p.url));

  const search = async (p = 1) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ courts: { code: string; label: string }[]; results: Result[]; total: number }>(`/api/cases/${caseId}/precedents?q=${encodeURIComponent(q)}&court=${encodeURIComponent(court)}&page=${p}`);
      setCourts(r.courts);
      setResults(p === 1 ? r.results : [...(results ?? []), ...r.results]);
      setTotal(r.total);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const add = async (r: Result) => {
    try {
      await api(`/api/findings/${findingId}/precedents`, { method: "POST", json: r });
      toast(`Linked ${r.citation ?? r.title}`);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not link the judgment", { tone: "danger" });
    }
  };

  const close = () => {
    setSearching(false);
    setResults(null);
  };

  const remove = async (p: PrecedentItem) => {
    await api(`/api/precedents/${p.id}`, { method: "DELETE" });
    toast("Precedent removed", { tone: "danger" });
    onChanged();
  };

  return (
    <section className="mt-5">
      <h3 className="text-[12px] font-medium text-muted">Precedents{items.length ? ` · ${items.length}` : ""}</h3>

      {items.length > 0 && (
        <ul className="mt-1.5 ">
          {items.map((p) => (
            <li key={p.id} className="group flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <a href={p.url} target="_blank" rel="noreferrer noopener" className="text-[13px] font-medium leading-snug hover:underline">
                  {p.title}
                </a>
                <p className="mt-0.5 text-[12px] text-muted">
                  {p.citation && <span className="tabular-nums text-ink">{p.citation}</span>}
                  {p.citation && (p.court || p.judgment_date) && " · "}
                  {[p.court, year(p.judgment_date)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!readOnly && (
                <button onClick={() => void remove(p)} aria-label={`Remove ${p.citation ?? p.title}`} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-faint hover:bg-hover hover:text-danger">
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && <p className="mt-1 text-[13px] text-muted">No precedent linked yet</p>}
      {!readOnly && (
        <button onClick={() => setSearching(true)} className="-ml-2 mt-1 h-8 rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-subtle">
          {items.length ? "Link more" : "Link precedents"}
        </button>
      )}

      {searching &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === "Escape" && close()} role="dialog" aria-modal="true" aria-label="Link precedents">
            <div className="animate-dialog flex max-h-[85vh] w-full max-w-[600px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
              <div className="flex items-center gap-3 px-5 py-3.5">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  Link precedents<span className="font-normal text-muted"> · {findingTitle}</span>
                </p>
                <button aria-label="Close" onClick={close} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="scroll-panel min-h-0 flex-1 px-5 pb-5 pt-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search(1);
                  }}
                  className="flex gap-1.5"
                >
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Legal terms, e.g. unfair dismissal" aria-label="Search terms" className={cx(inputCls, "min-w-0 flex-1")} />
                  {/* The shared input style is full width; the court picker keeps a fixed one. */}
                  <select value={court} onChange={(e) => setCourt(e.target.value)} aria-label="Court" className={cx(inputCls, "w-[190px]! shrink-0")}>
                    {(courts.length ? courts : [{ code: "", label: "All courts" }]).map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <button type="submit" disabled={busy || q.trim().length < 3} className="h-[38px] shrink-0 rounded-lg bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover disabled:bg-line-strong">
                    {busy && page === 1 ? "Searching…" : "Search"}
                  </button>
                </form>

                {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
                {results && results.length === 0 && !busy && <p className="mt-3 text-[12.5px] text-muted">No judgments contain all of these words. Try fewer or broader terms.</p>}
                {results && results.length > 0 && (
                  <ul className="mt-3 ">
                    {results.map((r) => {
                      const added = linked.has(r.url);
                      return (
                        <li key={r.url} className="flex items-start gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-[12.5px] font-medium leading-snug hover:underline">{r.title}</a>
                            <p className="mt-0.5 text-[11.5px] text-muted">
                              {r.citation && <span className="tabular-nums">{r.citation}</span>}
                              {r.citation && " · "}
                              {[r.court, year(r.date)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <button
                            disabled={added}
                            onClick={() => void add(r)}
                            className="h-7 shrink-0 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium hover:bg-subtle disabled:border-transparent disabled:text-ok"
                          >
                            {added ? "Linked" : "Link"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {results && results.length > 0 && results.length < total && (
                  <button disabled={busy} onClick={() => void search(page + 1)} className="mt-2 h-7 w-full rounded-lg text-[12px] text-muted hover:bg-hover hover:text-ink">
                    {busy ? "Loading…" : "Show more"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
