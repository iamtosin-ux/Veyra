"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "../Icon";
import { ChecklistCard, QUIET } from "../chat/AgentParts";

interface Signal {
  ref: string;
  text: string;
}
interface Assessment {
  key: string;
  label: string;
  protocol: string;
  signals: Signal[];
  checklist: { key: string; label: string; have: boolean; sources: Signal[] }[];
  coverage: number;
}
export interface Direction {
  types: { key: string; label: string }[];
  assessments: Assessment[];
  current: Assessment | null;
  suggestion: Assessment | null;
  carries: { evidence: number; findings: number; events: number; messages: number };
}

/** A /handoff typed in the chat: open the handoff agent, optionally at a named type. */
export interface HandoffRequest {
  n: number;
  query: string;
}

/** Pure: the case type a /handoff argument names, matched on any word of its label or key. */
export function matchType(query: string, types: { key: string; label: string }[]): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = types.find((t) => t.label.toLowerCase() === q || t.key === q.replace(/\s+/g, "_"));
  if (exact) return exact.key;
  return types.find((t) => q.split(/\s+/).every((w) => t.label.toLowerCase().includes(w)))?.key ?? null;
}

/**
 * The handoff agent, above the chat input. When Veyra finds the case would be
 * better built as another kind of case, it shows a tip to accept or decline.
 * Typing /handoff opens it by hand to choose any type. Either way the case
 * keeps everything, and the new type's checklist shows what's in place and
 * what's missing before the user commits.
 */
export function HandoffPrompt({ caseId, refreshKey, request, onCommitted, tipTarget }: { caseId: string; refreshKey: number; request: HandoffRequest | null; onCommitted: () => void; /** The notice line above the chat input, where Veyra's suggestion sits. */ tipTarget?: HTMLElement | null }) {
  const { data, reload } = useApi<Direction>(`/api/cases/${caseId}/direction`);
  const [mode, setMode] = useState<"suggested" | "manual" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New messages may mean new analysis: check again.
  useEffect(() => {
    void reload();
  }, [refreshKey, reload]);

  // /handoff opens the picker, at the named type when one matches. Each new
  // request is applied once, when it arrives.
  const [seen, setSeen] = useState(request?.n);
  if (request && request.n !== seen) {
    setSeen(request.n);
    setMode("manual");
    setPicked(data ? matchType(request.query, data.types) : null);
  }

  if (!data) return null;
  const s = data.suggestion;
  const from = data.current?.label;
  const target = picked ? data.assessments.find((a) => a.key === picked) ?? null : null;

  const close = () => {
    setMode(null);
    setPicked(null);
  };

  const decide = async (action: "commit" | "dismiss", to: string) => {
    setBusy(true);
    try {
      await api(`/api/cases/${caseId}/direction`, { method: "POST", json: { action, to } });
      if (action === "commit") {
        toast(`Handed off to ${data.assessments.find((a) => a.key === to)?.label ?? "the new case type"}`);
        onCommitted();
      }
      close();
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not hand off the case", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 space-y-2">
      {/* The tip: Veyra's suggestion, in the notice line above the input */}
      {s &&
        mode === null &&
        tipTarget &&
        createPortal(
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-[13px]">
            <span className="min-w-0 flex-1 text-muted">
              <span className="font-medium text-ink">Handoff</span> {from ? `Better built as ${s.label}` : `Reads like a ${s.label} case`}
            </span>
            <span className="flex shrink-0 gap-0.5">
              <button
                onClick={() => {
                  setMode("suggested");
                  setPicked(s.key);
                }}
                className="h-7 rounded-lg px-2 font-medium text-ink hover:bg-panel"
              >
                Review
              </button>
              <button onClick={() => void decide("dismiss", s.key)} disabled={busy} className="h-7 rounded-lg px-2 text-muted hover:bg-panel hover:text-ink">
                Dismiss
              </button>
            </span>
          </div>,
          tipTarget,
        )}

      {/* The new type's checklist: what's in place and what the new case could still need */}
      {mode !== null && target && (
        <div className="animate-pop">
          <ChecklistCard
            icon={<Icon name="transfer" size={16} />}
            title={`Hand off to ${target.label}`}
            count={`${target.checklist.filter((c) => c.have).length} of ${target.checklist.length} in place`}
            items={target.checklist.map((c) => ({ key: c.key, label: c.label, done: c.have, detail: c.have ? c.sources.map((x) => x.ref).join(" · ") : "Needed" }))}
            footer={
              <>
                <button disabled={busy} onClick={() => (mode === "suggested" ? void decide("dismiss", target.key) : close())} className={QUIET}>
                  Dismiss
                </button>
                <button onClick={() => void decide("commit", target.key)} disabled={busy} className="h-8 rounded-lg bg-primary px-3 text-[14px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {busy ? "Handing off" : "Approve"}
                </button>
              </>
            }
          />
          <p className="mt-1.5 px-1 text-[12px] text-muted">Built against the {target.protocol}. Everything the case holds carries over.</p>
        </div>
      )}

      {/* /handoff with no type named: choose one */}
      {mode === "manual" && !target && (
        <div className="animate-pop rounded-2xl border border-line bg-panel">
          <div className="flex items-center gap-2 px-3.5 pt-2.5">
            <p className="min-w-0 flex-1 truncate text-[14px] font-medium">Hand off to another case type</p>
            <button onClick={close} aria-label="Close" className="-mr-1.5 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
              <Icon name="close" size={15} />
            </button>
          </div>
          {data.assessments.length === 0 ? (
            <p className="px-3.5 pb-3 text-[13px] text-muted">No case types are set up for this case&apos;s industry yet.</p>
          ) : (
            <ul className="max-h-[40vh] overflow-y-auto p-1.5 pt-1">
              {data.assessments.map((a) => {
                const current = a.key === data.current?.key;
                return (
                  <li key={a.key}>
                    <button disabled={current} onClick={() => setPicked(a.key)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-subtle disabled:hover:bg-transparent">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{a.label}</span>
                        <span className="block truncate text-[12px] text-muted">{a.protocol}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">{current ? "Current" : `${a.checklist.filter((c) => c.have).length} of ${a.checklist.length}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
