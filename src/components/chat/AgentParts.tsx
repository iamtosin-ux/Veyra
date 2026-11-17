"use client";

import { Button as BoardButton } from "@/components/base/buttons/button";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "../Icon";
import { LogoMark, LogoSpinner } from "../Logo";
import { cx } from "../ui";
import { Badge, Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "../ui/trace";

// The agent's side of the conversation: who is speaking, what it did while
// working, the plans it proposes and the runs it carries out.

export function duration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** The name line above each reply. */
export function AgentHeader({ working }: { working?: boolean }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {working ? <LogoSpinner size={18} className="text-ink" /> : <LogoMark size={18} />}
      <span className="text-[14px] font-medium text-ink">Veyra</span>
    </div>
  );
}

export interface TraceStep {
  label: string;
  detail?: string;
}

export interface SourceChip {
  key: string;
  label: string;
  title?: string;
  onClick?: () => void;
}

/** The icon at the start of a trace line: a tick when done, a spinner while running, a cross on failure, a ring while waiting. */
function StepIcon({ state }: { state: "done" | "running" | "error" | "pending" }) {
  return (
    <TraceIcon>
      {state === "done" ? (
        <Icon name="checkFill" size={16} className="text-ink" />
      ) : state === "running" ? (
        <LogoSpinner size={14} className="text-ink" />
      ) : state === "error" ? (
        <Icon name="close" size={14} />
      ) : (
        <span className="size-3.5 rounded-full border border-line-strong" />
      )}
    </TraceIcon>
  );
}

function Sources({ chips }: { chips: SourceChip[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? chips : chips.slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1.5 pl-6">
      {shown.map((c) => (
        <button
          key={c.key}
          onClick={c.onClick}
          title={c.title}
          className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg bg-subtle px-2 py-0.5 text-[12px] text-ink hover:bg-hover"
        >
          <Icon name="files" size={12} className="shrink-0 text-muted" />
          <span className="truncate">{c.label}</span>
        </button>
      ))}
      {chips.length > 4 && (
        <button onClick={() => setAll((a) => !a)} className="rounded-lg px-1.5 py-0.5 text-[12px] text-muted hover:bg-subtle hover:text-ink">
          {all ? "Fewer" : `${chips.length - 4}+ more`}
        </button>
      )}
    </div>
  );
}

/** "Worked for 4s" under the name; opens to the steps taken and the sources checked. */
export function WorkedFor({ ms, steps, sources = [] }: { ms: number; steps: TraceStep[]; sources?: SourceChip[] }) {
  return (
    <Trace className="mb-2">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>Worked for {duration(ms)}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace aria-label="Steps taken">
            {sources.length > 0 && (
              <>
                <TraceLine>
                  <StepIcon state="done" />
                  <TraceTitle>
                    Checked {sources.length} source{sources.length === 1 ? "" : "s"}
                  </TraceTitle>
                </TraceLine>
                <Sources chips={sources} />
              </>
            )}
            {steps.length === 0 && (
              <TraceLine>
                <StepIcon state="done" />
                <TraceTitle>Answered from the conversation</TraceTitle>
              </TraceLine>
            )}
            {steps.map((s, i) => (
              <TraceLine key={i} className="items-start">
                <StepIcon state="done" />
                <TraceTitle wrap className="text-ink">
                  {s.label}
                  {s.detail && <span className="text-faint"> · {s.detail}</span>}
                </TraceTitle>
              </TraceLine>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

/** While a reply is being prepared: a live clock and what Veyra is doing right now. */
export function LiveWorking({ files = 0, steps, paceMs = 900 }: { files?: number; steps?: string[]; paceMs?: number }) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  // A known sequence moves on at a steady pace, the last step staying live until the work is done.
  const list = steps ?? [`Read your message${files > 0 ? ` · ${files} file${files === 1 ? "" : "s"} attached` : ""}`, "Looking through the case records"];
  const at = steps ? Math.min(list.length - 1, Math.floor((now - started) / paceMs)) : 1;
  // Keep the newest step in view as the list grows, above the input.
  const end = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [at]);
  return (
    <div role="status" aria-live="polite">
      <AgentHeader working />
      <Trace>
        <TraceCollapsible open onOpenChange={() => {}}>
          <TraceLine status="running">
            <TraceTitle>Working</TraceTitle>
            <TraceDescription>{duration(Math.max(1000, now - started))}</TraceDescription>
          </TraceLine>
          <TraceCollapsibleContent>
            <Trace>
              {list.slice(0, at + 1).map((label, i) => (
                <TraceLine key={label} className="items-start" status={i < at ? undefined : "running"}>
                  <StepIcon state={i < at ? "done" : "running"} />
                  <TraceTitle wrap className={i < at ? "text-ink" : undefined}>
                    {label}
                  </TraceTitle>
                </TraceLine>
              ))}
              <span ref={end} aria-hidden />
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans and runs share one card: a header with an icon tile, then a checklist.

export function CardShell({ icon, title, meta, children }: { icon: ReactNode; title: string; meta: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-line bg-panel">
      <div className="m-1 flex items-center gap-2.5 rounded-[calc(var(--radius-2xl)-4px)] bg-subtle p-1 pr-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[calc(var(--radius-2xl)-8px)] bg-panel text-ink">{icon}</span>
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-ink">{title}</p>
        <span className="shrink-0 text-[13px] text-muted">{meta}</span>
      </div>
      {children}
    </div>
  );
}

// Text buttons beside the primary one, as in a card's footer.
export const QUIET = "h-8 rounded-lg px-2.5 text-[14px] font-medium text-ink hover:bg-subtle disabled:opacity-50";

export interface ChecklistItem {
  key: string;
  label: string;
  /** Ticked when it's already in place. */
  done?: boolean;
  detail?: ReactNode;
}

/** The checklist card: a header whose count opens and closes the list, the items, then the card's actions. */
export function ChecklistCard({ icon, title, count, items, footer, error }: { icon: ReactNode; title: string; count: string; items: ChecklistItem[]; footer: ReactNode; error?: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <CardShell
      icon={icon}
      title={title}
      meta={
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-mr-1.5 inline-flex items-center gap-1 rounded-lg py-0.5 pl-1.5 pr-1 hover:bg-panel hover:text-ink">
          {count}
          <Icon name="chevron" size={16} className={cx("transition-transform duration-150", open && "rotate-90")} />
        </button>
      }
    >
      {open && (
        <ol className="space-y-0.5 px-2.5 pt-2" aria-label={title}>
          {items.map((it) => (
            <li key={it.key} className="flex items-start gap-2.5 px-1 py-1 text-[13px] leading-5">
              <span className="grid h-5 w-4 shrink-0 place-items-center">
                {it.done ? <Icon name="checkFill" size={16} className="text-ink" /> : <span className="h-4 w-4 rounded-full border border-line-strong" />}
              </span>
              <span className="min-w-0">
                <span className="block text-ink">{it.label}</span>
                {it.detail && <span className="block truncate text-[12px] text-muted">{it.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="px-3.5 pt-2 text-[12px] text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-1 p-2.5">{footer}</div>
    </CardShell>
  );
}

export interface PlanData {
  workflowId: string;
  name: string;
  steps: { key: string; label: string }[];
  status: "proposed" | "approved" | "dismissed";
  selected?: string[];
  runId?: string;
}

/** A workflow Veyra proposes. Nothing runs until the user approves it. */
export function PlanCard({ caseId, messageId, plan, onChanged, onRunStatus }: { caseId: string; messageId: string; plan: PlanData; onChanged: () => void; onRunStatus?: RunStatusHandler }) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "dismiss" | "restore") => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/api/cases/${caseId}/messages/${messageId}/plan`, { method: "POST", json: { decision } });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (plan.status === "approved" && plan.runId) return <RunCard runId={plan.runId} onDone={onChanged} onStatus={onRunStatus} />;
  if (plan.status === "dismissed")
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
        Plan dismissed
        <button disabled={!!busy} onClick={() => void decide("restore")} className="rounded-lg px-1.5 py-0.5 text-ink hover:bg-subtle disabled:opacity-50">
          Undo
        </button>
        {error && <span className="text-danger">{error}</span>}
      </p>
    );

  return (
    <ChecklistCard
      icon={<Icon name="workflow" size={16} />}
      title={`Run ${plan.name}`}
      count={`${plan.steps.length} step${plan.steps.length === 1 ? "" : "s"}`}
      items={plan.steps}
      error={error}
      footer={
        <>
          <button disabled={!!busy} onClick={() => void decide("dismiss")} className={QUIET}>
            Dismiss
          </button>
          <BoardButton variant="primary" size="small" disabled={!!busy} onClick={() => void decide("approve")}>
            {busy === "approve" ? "Starting" : "Approve and run"}
          </BoardButton>
        </>
      }
    />
  );
}

interface RunStep {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  detail: string | null;
}

export type RunStatusHandler = (runId: string, run: { name: string; status: string; current: number; total: number } | null) => void;

/** Live progress for a workflow run; polls until it finishes, then folds into one line. */
export function RunCard({ runId, onDone, onStatus }: { runId: string; onDone: () => void; onStatus?: RunStatusHandler }) {
  const [finished, setFinished] = useState(false);
  const { data, error } = useApi<{
    run: { workflow_name: string; workflow_instructions: string | null; prompt: string; status: string; steps: RunStep[]; error: string | null; created_at: string; finished_at: string | null };
  }>(`/api/workflow-runs/${runId}`, { pollMs: finished ? false : 2000 });
  const status = data?.run.status;
  const done = status === "completed" || status === "failed";
  const steps = (data?.run.steps ?? []).filter((s) => s.status !== "skipped");
  const current = steps.findIndex((s) => s.status === "running" || s.status === "pending");
  // Open while it runs, so its progress shows; it can be folded at any time.
  const [open, setOpen] = useState(true);
  const [seenDone, setSeenDone] = useState(false);
  if (done && !seenDone) {
    setSeenDone(true);
    setOpen(false);
  }

  // Tell the conversation what is running, for the line above the input.
  useEffect(() => {
    if (!data || !onStatus) return;
    onStatus(runId, done ? null : { name: data.run.workflow_name, status: data.run.status, current: current < 0 ? steps.length : current + 1, total: steps.length });
  }, [data, done, current, steps.length, runId, onStatus]);

  useEffect(() => {
    if (!done || finished) return;
    const t = setTimeout(() => {
      setFinished(true);
      onDone();
    }, 0);
    return () => clearTimeout(t);
  }, [done, finished, onDone]);

  if (error && !data) return <p className="mt-3 text-[13px] text-danger">{`Couldn't load the run. ${error}`}</p>;
  if (!data) return <div className="mt-3 h-5 w-48 animate-pulse rounded bg-subtle" aria-label="Loading the run" />;

  const r = data.run;
  const name = r.workflow_name;
  const title = status === "failed" ? `Failed to run ${name}` : done ? `Ran ${name}` : status === "queued" ? `Queued ${name}` : `Running ${name}`;
  const took = r.finished_at ? Date.parse(r.finished_at) - Date.parse(r.created_at) : null;

  // A workflow run reads like a subagent: one line for the run, opening to its task, its steps and what came of it.
  return (
    <Trace className="mt-3">
      <TraceCollapsible open={open} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={status === "failed" ? "error" : done ? undefined : "running"}>
            <StepIcon state={status === "failed" ? "error" : done ? "done" : "running"} />
            <TraceTitle className={done && status !== "failed" ? "text-ink" : undefined}>{title}</TraceTitle>
            <TraceDescription>{took != null ? duration(took) : `${current < 0 ? steps.length : current + 1} of ${steps.length}`}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-3">
          {(r.workflow_instructions || r.prompt) && (
            <div className="space-y-1.5">
              <p className="text-[13px] text-ink">{r.prompt || r.workflow_instructions}</p>
              <div className="flex flex-wrap gap-1">
                <Badge>Workflow</Badge>
                <Badge variant="outline">{steps.length} step{steps.length === 1 ? "" : "s"}</Badge>
              </div>
            </div>
          )}
          <Trace aria-label="Steps">
            {steps.map((s) => (
              <TraceLine key={s.key} className="items-start" status={s.status === "running" ? "running" : s.status === "failed" ? "error" : s.status === "pending" ? "pending" : undefined}>
                <StepIcon state={s.status === "completed" ? "done" : s.status === "running" ? "running" : s.status === "failed" ? "error" : "pending"} />
                <TraceTitle wrap className={s.status === "completed" ? "text-ink" : undefined}>
                  {s.label}
                  {s.detail && <span className={s.status === "failed" ? "text-danger" : "text-faint"}> · {s.detail}</span>}
                </TraceTitle>
              </TraceLine>
            ))}
          </Trace>
          {status === "failed" && r.error && <p className="text-[12px] text-danger">{r.error}</p>}
          {status === "completed" && <p className="text-[13px] text-ink">Done. What it found is in the reply below and on the canvas.</p>}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
