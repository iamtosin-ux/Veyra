"use client";

import { Button as BoardButton } from "@/components/base/buttons/button";
import { RiArrowUpLine } from "@remixicon/react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import type { SourceReference } from "@/lib/types";
import { PackUpdateCard } from "./case/PackUpdateCard";
import { HandoffPrompt, type HandoffRequest } from "./case/HandoffPrompt";
import { AddFromVaultModal } from "./AddFromVaultModal";
import { Icon } from "./Icon";
import { LogoSpinner } from "./Logo";
import { AgentHeader, LiveWorking, PlanCard, RunCard, WorkedFor, type PlanData, type RunStatusHandler } from "./chat/AgentParts";
import { ChatAddMenu, CreateDocumentModal } from "./ChatAddMenu";
import { VaultOfferCard, type VaultOfferData } from "./VaultOffer";
import { ChatWebSource } from "./SectionTools";
import { VoiceRecorder } from "./VoiceRecorder";
import { cx } from "./ui";

const ACCEPT = ".mp4,.mov,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.csv,.md,.txt";

interface ResolvedRef {
  ref: string;
  kind: "observation" | "finding" | "evidence";
  id: string;
  evidence_id?: string;
  evidence_type?: string;
  source_reference?: SourceReference;
  label: string;
}

type Action = { kind: "analyse" | "compare"; label: string } | { kind: "open"; view: string; label: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  created_at: string;
  content: {
    text: string;
    mode?: "ai" | "offline";
    refs?: ResolvedRef[];
    actions?: Action[];
    attachments?: { id: string; reference: string; filename: string }[];
    notice?: string;
    packUpdate?: string[];
    workflowRunId?: string;
    webSources?: string[];
    trace?: { steps: { label: string; detail?: string }[]; ms: number };
    vaultOffer?: VaultOfferData;
    plan?: PlanData;
  };
}

/** Commands typed with a leading slash; they run in the app instead of going to the assistant. */
const COMMANDS = [{ name: "/handoff", description: "Change the case type, keeping everything it holds" }];

export interface ChatHandlers {
  onOpenView: (view: string, params?: Record<string, string>) => void;
  onPreviewVersion?: (packId: string) => void;
  onOpenSource: (r: ResolvedRef) => void;
  onChanged: () => void;
}

/** Inline formatting: **bold**, and OBS/FND/EVD references as clickable chips. */
function Inline({ text, refs, onRef }: { text: string; refs: Map<string, ResolvedRef>; onRef: (r: ResolvedRef) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[?\b(?:OBS|FND|EVD)-\d{3,}\b\]?(?: \[unverified reference\])?)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        const m = p.match(/(OBS|FND|EVD)-\d{3,}/);
        if (m && /^\[?(OBS|FND|EVD)-\d{3,}\]?( \[unverified reference\])?$/.test(p)) {
          const r = refs.get(m[0]);
          if (!r) return <span key={i} className="rounded bg-danger-soft px-1 tabular-nums text-[11px] text-danger" title="Reference not found in this case">{m[0]} · unverified</span>;
          return (
            <button
              key={i}
              onClick={() => onRef(r)}
              title={r.label}
              className={cx(
                "mx-0.5 inline-flex translate-y-[-1px] items-center rounded-md px-1.5 py-px tabular-nums text-[11px] font-medium",
                r.kind === "observation" ? "bg-accent-soft text-accent hover:bg-[#e2e5fa]" : r.kind === "finding" ? "bg-draft-soft text-draft hover:bg-[#fbe9cf]" : "bg-subtle text-ink hover:bg-hover",
              )}
            >
              {r.ref}
            </button>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function RichText({ text, refs, onRef }: { text: string; refs: ResolvedRef[]; onRef: (r: ResolvedRef) => void }) {
  const map = new Map(refs.map((r) => [r.ref, r]));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1.5 space-y-1.5 pl-1">
        {list.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" />
            <span><Inline text={l} refs={map} onRef={onRef} /></span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*[-*•]\s+/.test(line)) list.push(line.replace(/^\s*[-*•]\s+/, ""));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1.5"><Inline text={line} refs={map} onRef={onRef} /></p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

/** Work started elsewhere on the page that Veyra reports on here, such as a template change. */
export interface ChatWork {
  prompt: string;
  steps: string[];
  /** When it started; a reply posted after this replaces the working state. */
  since: number;
}

export function CaseChat({ caseId, compact, handlers, refreshKey = 0, working = null }: { caseId: string; compact: boolean; handlers: ChatHandlers; refreshKey?: number; working?: ChatWork | null }) {
  // The line above the input: only for system notices, such as a running workflow or a suggested handoff.
  const [noticeEl, setNoticeEl] = useState<HTMLDivElement | null>(null);
  const { data, reload, error: loadError } = useApi<{ messages: Message[]; aiConfigured: boolean }>(`/api/cases/${caseId}/messages`);
  const hasWeb = (data?.messages ?? []).some((m) => m.content.webSources?.length);
  const webApi = useApi<{ sources: WebSourceLite[] }>(hasWeb ? `/api/cases/${caseId}/web-sources` : null, { pollMs: 6000 });
  // Another part of the page posted to the conversation.
  useEffect(() => {
    if (refreshKey) void reload();
  }, [refreshKey, reload]);
  const me = useApi<{ user: { name: string } }>("/api/auth/me");
  const firstName = (me.data?.user.name ?? "").split(" ")[0];
  const [pending, setPending] = useState<Message[]>([]);
  // Web sources on or off for this case, remembered in this browser.
  const webKey = `veyra.web.${caseId}`;
  const [web, setWebState] = useState(false);
  // Read after mount so the server and first client render agree.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setWebState(localStorage.getItem(webKey) === "on");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [webKey]);
  const setWeb = (on: boolean) => {
    setWebState(on);
    try {
      localStorage.setItem(webKey, on ? "on" : "off");
    } catch {}
  };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [fromVault, setFromVault] = useState(false);
  const [writing, setWriting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // "Ask Veyra" from an evidence annotation: drop the context into the input.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setText((t) => (t ? `${t}\n${text}` : text));
      setTimeout(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }, 0);
    };
    window.addEventListener("veyra:ask", onAsk);
    return () => window.removeEventListener("veyra:ask", onAsk);
  }, []);
  const messages = [...(data?.messages ?? []), ...pending];
  // The workflow running right now, if any, for the line above the input.
  const [runs, setRuns] = useState<Record<string, { name: string; status: string; current: number; total: number }>>({});
  const onRunStatus = useCallback<RunStatusHandler>((id, r) => {
    setRuns((cur) => {
      if (!r) {
        if (!(id in cur)) return cur;
        const next = { ...cur };
        delete next[id];
        return next;
      }
      const was = cur[id];
      return was && was.status === r.status && was.current === r.current ? cur : { ...cur, [id]: r };
    });
  }, []);
  const active = Object.values(runs)[0];
  const reloadAll = useCallback(() => {
    void reload();
    handlers.onChanged();
  }, [reload, handlers]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy, working]);

  async function send(body: { text: string; attachments?: string[] }, optimistic?: Message["content"]) {
    setBusy(true);
    setError(null);
    setPending([{ id: "pending", role: "user", created_at: "", content: optimistic ?? { text: body.text } }]);
    try {
      await api(`/api/cases/${caseId}/messages`, { method: "POST", json: { ...body, web: web && !!data?.aiConfigured } });
      await reload();
      handlers.onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed");
    } finally {
      setPending([]);
      setBusy(false);
    }
  }

  async function uploadAndSend(files: File[]) {
    if (!files.length) return;
    const ids: string[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
      const fd = new FormData();
      fd.append("files", f);
      const res = await fetch(`/api/cases/${caseId}/evidence`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      const r = body.results?.[0];
      if (r?.ok) ids.push(r.evidence.id);
      else failed.push(`${f.name}: ${r?.error ?? body.error ?? "upload failed"}`);
    }
    setUploading(null);
    if (failed.length) setError(`Not added: ${failed.join("; ")}`);
    if (ids.length) await send({ text: text.trim(), attachments: ids }, { text: text.trim(), attachments: ids.map((id, k) => ({ id, reference: "…", filename: files[k]?.name ?? "" })) });
    setText("");
  }

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    // Slash commands run here rather than going to the assistant.
    const handoff = t.match(/^\/handoff\b\s*(.*)$/i);
    if (handoff) return setHandoffRequest((r) => ({ n: (r?.n ?? 0) + 1, query: handoff[1] ?? "" }));
    void send({ text: t });
  };
  const [handoffRequest, setHandoffRequest] = useState<HandoffRequest | null>(null);
  // Typing "/" lists the commands that match what's been typed so far.
  const slash = /^\/\S*$/.test(text) ? COMMANDS.filter((c) => c.name.startsWith(text.toLowerCase())) : [];

  const onAction = (a: Action) => {
    if (a.kind === "open") handlers.onOpenView(a.view);
    else void send({ text: a.kind === "analyse" ? "Analyse the new evidence" : "Compare the evidence and generate findings" });
  };

  return (
    <div
      className="relative flex h-full flex-col bg-panel"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void uploadAndSend([...e.dataTransfer.files]);
      }}
    >
      {drag && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">Drop files to add them as evidence</div>
      )}
      <div className="scroll-panel min-h-0 flex-1">
        {/* An empty conversation sits its greeting just above the input */}
        <div className={cx("mx-auto px-5 pb-6 pt-8", compact ? "max-w-full" : "max-w-[720px]", data && messages.length === 0 && "flex min-h-full flex-col justify-end")}>
          {/* Loading or failing to load the conversation, before there is anything to show */}
          {!data && !loadError && (
            <div className="space-y-6" aria-busy="true" aria-label="Loading the conversation">
              <span className="ml-auto block h-9 w-2/3 animate-pulse rounded-2xl bg-subtle" />
              <div className="space-y-2">
                <span className="block h-3 w-1/3 animate-pulse rounded bg-subtle" />
                <span className="block h-3 w-11/12 animate-pulse rounded bg-subtle" />
                <span className="block h-3 w-4/5 animate-pulse rounded bg-subtle" />
              </div>
            </div>
          )}
          {!data && loadError && (
            <p role="alert" className="text-[13px] text-danger">
              {`Couldn't load the conversation. ${loadError}`}{" "}
              <button onClick={() => void reload()} className="rounded-lg px-1 font-medium text-ink underline underline-offset-2 hover:bg-subtle">
                Try again
              </button>
            </p>
          )}
          {data && messages.length === 0 && (
            <div>
              <h2 className="text-[17px] font-normal leading-[1.45] text-ink">Hello{firstName ? `, ${firstName}` : ""}, where do we begin.</h2>
              <p className="mt-1 text-[14px] text-muted">Add evidence with +, ask a question, or tell me what happened.</p>
            </div>
          )}
          <div className="space-y-7">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex flex-col items-end gap-1.5">
                  {m.content.attachments && m.content.attachments.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {m.content.attachments.map((a) => (
                        <button key={a.id} onClick={() => handlers.onOpenView("evidence", { e: a.id })} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[12px] hover:bg-subtle">
                          <Icon name="files" size={13} className="text-muted" />
                          <span className="tabular-nums text-[11px] text-faint">{a.reference}</span>
                          <span className="max-w-[200px] truncate">{a.filename}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {m.content.text && <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-subtle px-3.5 py-2 text-[15px] leading-[1.6] text-ink">{m.content.text}</div>}
                </div>
              ) : (
                <div key={m.id} className="group">
                  <AgentHeader />
                  {m.content.trace && (
                    <WorkedFor
                      ms={m.content.trace.ms}
                      steps={m.content.trace.steps}
                      sources={(m.content.refs ?? []).map((r) => ({ key: r.ref, label: `${r.ref} · ${r.label}`, title: r.label, onClick: () => handlers.onOpenSource(r) }))}
                    />
                  )}
                  <div className="text-[15px] leading-[1.7] text-ink">
                    <RichText text={m.content.text} refs={m.content.refs ?? []} onRef={handlers.onOpenSource} />
                  </div>
                  {m.content.webSources && m.content.webSources.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {m.content.webSources.map((id) => {
                        const w = webApi.data?.sources.find((x) => x.id === id);
                        return w ? (
                          <WebSourceCard
                            key={id}
                            w={w}
                            onDecide={async (decision) => {
                              await api(`/api/cases/${caseId}/web-sources/${id}`, { method: "PATCH", json: { decision } });
                              await Promise.all([webApi.reload(), reload()]);
                              handlers.onChanged();
                            }}
                          />
                        ) : null;
                      })}
                    </div>
                  )}
                  {m.content.workflowRunId && <RunCard runId={m.content.workflowRunId} onDone={reloadAll} onStatus={onRunStatus} />}
                  {m.content.plan && <PlanCard caseId={caseId} messageId={m.id} plan={m.content.plan} onChanged={reloadAll} onRunStatus={onRunStatus} />}
                  {m.content.notice && <p className="mt-1.5 text-[13px] text-draft">{m.content.notice}</p>}
                  {m.content.vaultOffer && <VaultOfferCard caseId={caseId} messageId={m.id} offer={m.content.vaultOffer} onDone={() => void reload()} />}
                  {m.content.packUpdate && m.content.packUpdate.length > 0 && (
                    <PackUpdateCard caseId={caseId} changes={m.content.packUpdate} at={m.created_at} onPreview={(id) => handlers.onPreviewVersion?.(id)} />
                  )}
                  {m.content.actions && m.content.actions.length > 0 && !m.content.packUpdate?.length && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {m.content.actions.map((a, i) => (
                        <button key={i} onClick={() => onAction(a)} className="rounded-lg border border-line-strong bg-panel px-2.5 py-1 text-[13px] font-medium hover:bg-subtle">
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <LiveWorking files={pending[0]?.content.attachments?.length ?? 0} />}
            {working && !messages.some((m) => m.role === "assistant" && Date.parse(m.created_at) >= working.since - 1000) && (
              <>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-subtle px-3.5 py-2 text-[15px] leading-[1.6] text-ink">{working.prompt}</div>
                </div>
                <LiveWorking steps={working.steps} paceMs={Math.floor(3400 / working.steps.length)} />
              </>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className={cx("mx-auto w-full px-4 pb-4", compact ? "" : "max-w-[760px]")}>
        {(error || uploading) && <p className={cx("mb-2 px-1 text-[12px]", error ? "text-danger" : "text-muted")}>{error ?? uploading}</p>}
        <HandoffPrompt caseId={caseId} refreshKey={messages.length} request={handoffRequest} tipTarget={noticeEl} onCommitted={() => { void reload(); handlers.onChanged(); }} />
        {slash.length > 0 && (
          <ul className="animate-pop mb-2 rounded-xl border border-line bg-panel p-1 shadow-[var(--shadow-card)]" role="listbox" aria-label="Commands">
            {slash.map((c) => (
              <li key={c.name}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setText(`${c.name} `);
                    taRef.current?.focus();
                  }}
                  className="flex w-full items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-subtle"
                >
                  <span className="text-[13px] font-medium text-accent">{c.name}</span>
                  <span className="truncate text-[12px] text-muted">{c.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* With no notice the strip is empty and the input stands on its own. */}
        <div className="group/composer rounded-2xl has-[[data-notice]>:not(:empty)]:bg-subtle has-[[data-notice]>:not(:empty)]:p-1">
          <div data-notice aria-live="polite">
            {active && (
              <p className="flex h-8 items-center gap-2 px-2.5 text-[13px]">
                <LogoSpinnerSmall />
                <span className="truncate font-medium text-ink">{active.name}</span>
                <span className="shrink-0 text-muted">{active.status === "queued" ? "Queued" : `Step ${active.current} of ${active.total}`}</span>
              </p>
            )}
            {/* Veyra's handoff suggestion is placed here by the handoff agent. */}
            <div ref={setNoticeEl} className="empty:hidden" />
          </div>
        <div className="rounded-2xl border border-line bg-panel transition-colors focus-within:border-line-strong group-has-[[data-notice]>:not(:empty)]/composer:rounded-[calc(var(--radius-2xl)-4px)]">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask Veyra"
            aria-label="Message Veyra"
            className="block max-h-[200px] min-h-[64px] w-full resize-none bg-transparent px-3.5 pt-3 text-[15px] outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
            <ChatAddMenu
              disabled={busy || !!uploading}
              onFiles={() => fileRef.current?.click()}
              onFolder={() => folderRef.current?.click()}
              onVault={() => setFromVault(true)}
              onDocument={() => setWriting(true)}
            />
            <ChatWebSource aiConfigured={!!data?.aiConfigured} enabled={web} onChange={setWeb} disabled={busy} />
            <VoiceRecorder disabled={busy || !!uploading} onRecorded={(f) => void uploadAndSend([f])} />
            <input ref={fileRef} type="file" multiple className="sr-only" accept={ACCEPT} onChange={(e) => { void uploadAndSend([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {/* A whole folder: only supported files are uploaded (system files and the like are skipped). */}
            <input
              ref={folderRef}
              type="file"
              multiple
              className="sr-only"
              {...{ webkitdirectory: "" }}
              onChange={(e) => {
                void uploadAndSend([...(e.target.files ?? [])].filter((f) => ACCEPT.split(",").some((x) => f.name.toLowerCase().endsWith(x))));
                e.target.value = "";
              }}
            />
            <BoardButton onClick={submit} disabled={!text.trim() || busy} aria-label="Send" variant="primary" size="small" iconOnly leadingIcon={RiArrowUpLine} className="ml-auto" />
          </div>
        </div>
        </div>
      </div>
      {writing && (
        <CreateDocumentModal
          caseId={caseId}
          onClose={() => setWriting(false)}
          onCreated={(doc) => {
            const t = text.trim();
            setText("");
            void send({ text: t, attachments: [doc.id] }, { text: t, attachments: [doc] });
          }}
        />
      )}
      {fromVault && (
        <AddFromVaultModal
          caseId={caseId}
          onClose={() => setFromVault(false)}
          onAdded={(added) => {
            const t = text.trim();
            setText("");
            void send({ text: t, attachments: added.map((a) => a.id) }, { text: t, attachments: added });
          }}
        />
      )}
    </div>
  );
}

export type { ResolvedRef };

function LogoSpinnerSmall() {
  return <LogoSpinner size={14} className="shrink-0 text-ink" />;
}

interface WebSourceLite {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  relevance: string;
  origin: "link" | "search";
  status: "proposed" | "approved" | "dismissed";
}

/** A proposed web source: clearly marked as outside material, approved or dismissed here. */
function WebSourceCard({ w, onDecide }: { w: WebSourceLite; onDecide: (d: "approve" | "dismiss") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  let host = w.url;
  try {
    host = new URL(w.url).hostname.replace(/^www\./, "");
  } catch {}
  const decide = async (d: "approve" | "dismiss") => {
    setBusy(true);
    await onDecide(d).catch(() => {});
    setBusy(false);
  };
  return (
    <div className={cx("rounded-xl border border-dashed px-3 py-2.5", w.status === "dismissed" ? "border-line opacity-60" : "border-[#9cc3e4] bg-[#f4f9fd]")}>
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#2f6fa3]">
        <Icon name="globe" size={11} /> Web source · not evidence
      </p>
      <a href={w.url} target="_blank" rel="noreferrer noopener" className="mt-1 block text-[13px] font-medium text-[#1f5a8a] hover:underline">
        {w.title}
      </a>
      <p className="text-[11px] text-faint">{host}{w.origin === "search" ? " · summary by AI" : " · page description"}</p>
      {w.excerpt && <p className="mt-1 text-[12px] leading-relaxed text-ink">{w.excerpt}</p>}
      {w.relevance && <p className="mt-1 text-[12px] text-muted">Why: {w.relevance}</p>}
      <div className="mt-2 flex items-center gap-2">
        {w.status === "proposed" ? (
          <>
            <button disabled={busy} onClick={() => void decide("approve")} className="rounded-lg bg-primary px-2.5 py-1 text-[12px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
              Approve
            </button>
            <button disabled={busy} onClick={() => void decide("dismiss")} className="rounded-lg border border-line-strong bg-panel px-2.5 py-1 text-[12px] font-medium hover:bg-subtle disabled:opacity-50">
              Dismiss
            </button>
          </>
        ) : (
          <span className={cx("text-[12px]", w.status === "approved" ? "text-ok" : "text-muted")}>{w.status === "approved" ? "✓ Added to the section" : "Dismissed"}</span>
        )}
      </div>
    </div>
  );
}
