"use client";

import { useState } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { parseJsonSafe } from "./util";
import { Button, Chip, ErrorNote, Notice, ProcessingChip, cx } from "../ui";
import type { CaseData } from "./types";

interface RunDetail {
  id: string;
  scope: string;
  status: string;
  stage: string | null;
  model_identifier: string | null;
  processing_configuration: string;
  error_details: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  evidence_reference: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  images_sent: number;
  media_seconds: number;
  ai_ms: number;
  rejections: number;
}

const EVIDENCE_STAGES = ["Queued", "Extracting content", "Transcribing audio", "Detecting scenes", "Sampling frames", "Analysing media", "Generating observations", "Validating citations", "Ready for review"];
const CASE_STAGES = ["Queued", "Comparing evidence", "Preparing findings", "Ready for review"];

export function AnalysisTab({ data, reload, aiConfigured, go }: { data: CaseData; reload: () => void; aiConfigured: boolean; go: (t: "findings" | "evidence", extra?: Record<string, string>) => void }) {
  const active = data.runs.some((r) => r.status === "queued" || r.status === "running");
  const runsApi = useApi<{ runs: RunDetail[]; rejections: { analysis_run_id: string; item_kind: string; reason: string; payload: string; created_at: string }[] }>(
    `/api/cases/${data.case.id}/runs`,
    { pollMs: active ? 3000 : 20000 },
  );
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const unprocessed = data.evidence.filter((e) => e.processing_status === "pending" || e.processing_status === "failed");
  const processed = data.evidence.filter((e) => e.processing_status === "processed");
  const caseRun = data.latestCaseRun;
  const caseBusy = caseRun && (caseRun.status === "queued" || caseRun.status === "running");
  const evidenceBusy = data.evidence.some((e) => e.processing_status === "queued" || e.processing_status === "processing");
  const coverage = parseJsonSafe<{ coverage_notes?: string[] }>(caseRun?.processing_configuration, {}).coverage_notes ?? [];

  const run = async (url: string) => {
    setError(null);
    try {
      await api(url, { method: "POST" });
      reload();
      void runsApi.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const totals = (runsApi.data?.runs ?? []).reduce(
    (a, r) => ({ input: a.input + r.input_tokens, output: a.output + r.output_tokens, images: a.images + r.images_sent, media: a.media + r.media_seconds }),
    { input: 0, output: 0, images: 0, media: 0 },
  );

  return (
    <div className="scroll-panel h-full">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {!aiConfigured && <ErrorNote>AI analysis is not configured on the server (ANTHROPIC_API_KEY). Jobs will fail with an explanatory error until it is set.</ErrorNote>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <section className="rounded-lg border border-line bg-panel">
          <header className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="font-display text-lg">1 · Individual evidence analysis</h2>
              <p className="text-xs text-muted">Each item is processed with a format-specific pipeline and produces source-linked observations.</p>
            </div>
            <Button variant="primary" disabled={unprocessed.length === 0} onClick={() => run(`/api/cases/${data.case.id}/process`)}>
              Analyse {unprocessed.length} item{unprocessed.length === 1 ? "" : "s"}
            </Button>
          </header>
          <table className="w-full text-sm">
            <tbody>
              {data.evidence.map((e) => {
                const r = data.runs.find((x) => x.evidence_id === e.id && x.scope === "evidence");
                const busy = r && (r.status === "queued" || r.status === "running");
                return (
                  <tr key={e.id} className="last:border-0">
                    <td className="w-24 px-5 py-2.5 tabular-nums text-xs text-muted">{e.reference}</td>
                    <td className="max-w-0 truncate py-2.5">
                      <button className="hover:underline" onClick={() => go("evidence", { e: e.id })}>{e.original_filename}</button>
                    </td>
                    <td className="w-28 py-2.5 text-xs text-muted">{e.evidence_type.replace("_", " ")}</td>
                    <td className="w-[300px] py-2.5">
                      {busy ? <StageTrack stages={EVIDENCE_STAGES} current={r!.stage} /> : <ProcessingChip status={e.processing_status} />}
                      {e.processing_status === "failed" && r?.error_details && <p className="mt-1 text-xs text-danger">{r.error_details}</p>}
                    </td>
                    <td className="w-20 py-2.5 text-right text-xs tabular-nums text-muted">{e.observation_count ? `${e.observation_count} obs.` : ""}</td>
                    <td className="w-28 px-5 py-2.5 text-right">
                      {!busy && (e.processing_status === "failed" || e.processing_status === "pending") && (
                        <Button size="sm" onClick={() => run(`/api/evidence/${e.id}/process`)}>{e.processing_status === "failed" ? "Retry" : "Analyse"}</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.evidence.length === 0 && (
                <tr><td className="px-5 py-6 text-sm text-faint">No evidence uploaded.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-line bg-panel">
          <header className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="font-display text-lg">2 · Cross-evidence analysis</h2>
              <p className="text-xs text-muted">Compares observations across all processed items to propose relationships, discrepancies, a chronology and open questions.</p>
            </div>
            <Button variant="primary" disabled={!!caseBusy || evidenceBusy || processed.length === 0} onClick={() => run(`/api/cases/${data.case.id}/analyse`)}>
              {caseRun?.status === "completed" ? "Re-run comparison" : "Compare evidence"}
            </Button>
          </header>
          <div className="space-y-3 px-5 py-4 text-sm">
            {evidenceBusy && <p className="text-xs text-muted">Waiting for evidence processing to finish.</p>}
            {!caseRun && <p className="text-muted">Not run yet. {processed.length} of {data.evidence.length} items are ready to compare.</p>}
            {caseBusy && <StageTrack stages={CASE_STAGES} current={caseRun!.stage} />}
            {caseRun?.status === "completed" && (
              <div className="flex items-center justify-between">
                <p>Last completed {formatDateTime(caseRun.completed_at)}. <span className="text-muted">{data.case.findings_count} active findings, {data.case.findings_needing_review} awaiting review.</span></p>
                <Button size="sm" onClick={() => go("findings")}>Review findings →</Button>
              </div>
            )}
            {caseRun?.status === "failed" && <ErrorNote>Comparison failed: {caseRun.error_details}</ErrorNote>}
            {caseRun?.status === "completed" && (
              <Notice tone="info">Re-running never overwrites reviewed findings. Unreviewed drafts from earlier runs are archived and replaced.</Notice>
            )}
            {coverage.length > 0 && (
              <div>
                <h3 className="text-[12px] font-medium text-muted">Stated limits of this analysis</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink">{coverage.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel">
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div>
              <h2 className="font-display text-lg">Processing history and usage</h2>
              <p className="text-xs text-muted">
                Totals: {totals.input.toLocaleString()} input / {totals.output.toLocaleString()} output tokens · {totals.images} images · {Math.round(totals.media)} s of media
              </p>
            </div>
            <button className="text-xs text-accent hover:underline" onClick={() => setShowRejected((s) => !s)}>
              {showRejected ? "Hide" : "Show"} AI claims removed by validation ({runsApi.data?.rejections.length ?? 0})
            </button>
          </header>
          {showRejected && (
            <div className="bg-canvas px-5 py-3">
              <p className="mb-2 text-xs text-muted">Model output that failed citation or schema checks (for example quotes not found in the source, frames never inspected, or invented references). Tracked as unsupported claims; never shown as findings.</p>
              <ul className="space-y-1.5 text-xs">
                {(runsApi.data?.rejections ?? []).map((r, i) => {
                  const p = parseJsonSafe<{ description?: string; title?: string }>(r.payload, {});
                  return (
                    <li key={i} className="rounded border border-line bg-panel px-2 py-1.5">
                      <Chip tone="danger">{r.item_kind}</Chip> <span className="text-danger">{r.reason}</span>
                      <p className="mt-0.5 text-muted">{p.title ?? p.description}</p>
                    </li>
                  );
                })}
                {(runsApi.data?.rejections.length ?? 0) === 0 && <li className="text-faint">None.</li>}
              </ul>
            </div>
          )}
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr className="">
                <th className="px-5 py-2 font-medium">Run</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 text-right font-medium">Tokens in / out</th>
                <th className="py-2 text-right font-medium">Images</th>
                <th className="py-2 text-right font-medium">Rejected</th>
                <th className="px-5 py-2 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {(runsApi.data?.runs ?? []).map((r) => (
                <tr key={r.id} className="last:border-0">
                  <td className="px-5 py-2">{r.scope === "case" ? "Cross-evidence" : r.scope === "segment" ? `Segment · ${r.evidence_reference}` : r.evidence_reference}</td>
                  <td className={cx("py-2", r.status === "failed" && "text-danger")}>{r.status}{r.status === "failed" && r.error_details ? `: ${r.error_details.slice(0, 80)}` : ""}</td>
                  <td className="py-2 tabular-nums text-muted">{r.model_identifier ?? "n/a"}</td>
                  <td className="py-2 text-right tabular-nums">{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{r.images_sent}</td>
                  <td className="py-2 text-right tabular-nums">{r.rejections || ""}</td>
                  <td className="px-5 py-2 text-muted">{formatDateTime(r.started_at ?? r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function StageTrack({ stages, current }: { stages: string[]; current: string | null }) {
  const idx = Math.max(0, stages.indexOf(current ?? "Queued"));
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-info" /></span>
      <span className="text-xs font-medium text-info">{current ?? "Queued"}</span>
      <span className="text-[11px] text-faint">step {idx + 1} of {stages.length}</span>
    </div>
  );
}
