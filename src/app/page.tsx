"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, formatBytes, useApi } from "@/lib/client";
import { AppShell, Crumb } from "@/components/AppShell";
import { CasePreviewCard, type CaseItem } from "@/components/CaseCard";
import { RiArrowUpLine } from "@remixicon/react";
import { Icon, type IconName } from "@/components/Icon";
import { ErrorNote, Reveal, cx } from "@/components/ui";
import { Button as BoardButton } from "@/components/base/buttons/button";
import { RecordingsList, type Recording } from "@/components/RecordingsList";

type Mode = "record" | "create" | "analyse" | "review";
const MODES: { key: Mode; label: string; tint: string }[] = [
  { key: "record", label: "Record", tint: "text-[#c8613a]" },
  { key: "create", label: "Create", tint: "text-ink" },
  { key: "analyse", label: "Analyse", tint: "text-[#2f6fa3]" },
  { key: "review", label: "Review", tint: "text-[#2f8f6a]" },
];

// What Create can write. The text typed in the composer becomes the document.
const DOC_KINDS: { id: string; title: string; description: string }[] = [
  { id: "Witness statement", title: "Witness statement", description: "What someone saw or heard, in their words, with the date, time and place." },
  { id: "File note", title: "File note", description: "A record of a call, visit or decision, for the case file." },
  { id: "Incident report", title: "Incident report", description: "What happened, when and where, who was involved and what was done." },
  { id: "Letter", title: "Letter", description: "A letter to a tenant, client, landlord or the other side." },
];

interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: "analyse" | "review" | "custom";
  steps: string[];
  is_default: boolean;
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const casesApi = useApi<{ cases: CaseItem[] }>("/api/cases", { pollMs: 10000 });
  const workflows = useApi<{ workflows: Workflow[]; steps: Record<string, { label: string }> }>("/api/workflows");
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordings = useApi<{ recordings: Recording[]; folderId: string | null }>("/api/recordings", { pollMs: 8000 });
  const analyseWorkflowId = workflows.data?.workflows.find((w) => w.kind === "analyse" && w.is_default)?.id ?? null;

  const cases = useMemo(() => casesApi.data?.cases ?? [], [casesApi.data]);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  const shown = cases.slice(0, 6);
  // Only recordings that haven't started a case yet; the rest live in their cases.
  const unprocessed = (recordings.data?.recordings ?? []).filter((r) => !r.case);

  const router = useRouter();
  const focusComposer = () => setTimeout(() => document.getElementById("composer-input")?.focus(), 0);

  // "New" in the sidebar lands here with ?new=1, and search hands over what was typed
  // with ?prompt=: either way, put the cursor in the composer.
  const isNew = params.get("new");
  const prompt = params.get("prompt") ?? "";
  useEffect(() => {
    if (isNew || prompt) document.getElementById("composer-input")?.focus();
  }, [isNew, prompt]);

  return (
    <AppShell breadcrumb={<Crumb current>Home</Crumb>}>
      <div className="relative h-full bg-panel">
      <div className="scroll-panel h-full">
        {/* Bottom padding leaves room for the composer, which floats over the page */}
        <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col px-8 pb-32 pt-12">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-[#d9822b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d9822b]" />
            {today}
          </p>
          <h1 className="mt-3 text-[28px] font-medium leading-tight ">What would you like to work on?</h1>

          {/* The four ways in; each opens its panel in the composer below */}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Start with">
            {MODES.map((x) => {
              const on = mode === x.key;
              return (
                <button
                  key={x.key}
                  aria-pressed={on}
                  onClick={() => {
                    // Record opens its own page: a chat with the recording running
                    if (x.key === "record") return router.push("/record");
                    setMode(on ? null : x.key);
                    if (!on) focusComposer();
                  }}
                  className={cx(
                    "flex items-center gap-2.5 rounded-xl border bg-background-primary-default p-4 text-left shadow-xs transition-colors",
                    on ? "border-accent-600 ring-2 ring-accent-100" : "border-border-button-default hover:border-border-button-hover",
                  )}
                >
                  <span className="text-muted"><ModeIcon mode={x.key} filled={false} /></span>
                  <span className="text-[14px] font-medium">{x.label}</span>
                </button>
              );
            })}
          </div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

          {unprocessed.length > 0 && (
            <section className="mt-12">
              <p className="text-[14px] font-medium">Recordings</p>
              <div className="mt-3">
                <RecordingsList recordings={unprocessed.slice(0, 8)} highlight={null} folderId={recordings.data!.folderId} analyseWorkflowId={analyseWorkflowId} onChanged={() => void recordings.reload()} />
              </div>
            </section>
          )}

          <div className="mt-12 flex items-center">
            <p className="text-[14px] font-medium">Recent cases</p>
            <Link href="/cases" className="ml-auto text-[13px] text-muted hover:text-ink">View all</Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
            {casesApi.loading && !casesApi.data && <p className="text-sm text-muted">Loading…</p>}
            {casesApi.data && shown.length === 0 && (
              <div className="col-span-full rounded-2xl bg-[#f7f7f6] px-6 py-10 text-center text-[13px] text-muted">No cases yet. Describe one below, or attach evidence.</div>
            )}
            {shown.map((c) => <CasePreviewCard key={c.id} c={c} />)}
          </div>

        </div>
      </div>
      {/* The composer is pinned to the foot of the page, over a fade so content scrolls under it.
          Out of the page flow, it grows upward without moving anything. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-panel from-50% to-transparent pt-12">
        <div className="pointer-events-auto mx-auto w-full max-w-[860px] px-8 pb-5">
          <Composer
            key={prompt}
            initialText={prompt}
            mode={mode}
            setMode={setMode}
            cases={cases}
            workflows={workflows.data?.workflows ?? []}
            onError={setError}
          />
        </div>
      </div>
      </div>
    </AppShell>
  );
}

/** The action's GitLab icon. */
function ModeIcon({ mode, size = 16 }: { mode: Mode; filled?: boolean; size?: number }) {
  const name = ({ record: "mic", create: "pack", analyse: "analyse", review: "review" } as const)[mode];
  return <Icon name={name} size={size} />;
}

const NEW_TARGET = "new";

function Composer({
  initialText,
  mode,
  setMode,
  cases,
  workflows,
  onError,
}: {
  initialText: string;
  mode: Mode | null;
  setMode: (m: Mode | null) => void;
  cases: CaseItem[];
  workflows: Workflow[];
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(NEW_TARGET);
  const fileRef = useRef<HTMLInputElement>(null);
  const vault = useApi<{ folders: { id: string; title: string; archived: boolean; files: number; bytes: number }[] }>("/api/vault");

  const m = MODES.find((x) => x.key === mode);
  const builtIn = (kind: "analyse" | "review") => workflows.find((w) => w.kind === kind && w.is_default);
  const workflow = mode === "analyse" || mode === "review" ? builtIn(mode) : undefined;
  const [docKind, setDocKind] = useState(DOC_KINDS[0].id);
  // The workflows list opens above the input from a leading "/".
  const [browsing, setBrowsing] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = !!mode || browsing;
  const close = () => {
    setMode(null);
    setBrowsing(false);
    setTarget(NEW_TARGET);
  };
  const pickWorkflow = (w: Workflow) => {
    setBrowsing(false);
    if (text.startsWith("/")) setText("");
    if (w.kind === "analyse" || w.kind === "review") setMode(w.kind);
    else router.push(`/workflows/${w.id}`);
    document.getElementById("composer-input")?.focus();
  };

  const ready =
    !busy &&
    (workflow
      ? target !== NEW_TARGET || !!text.trim() || files.length > 0
      : mode === "create"
        ? !!text.trim()
        : !!text.trim() || files.length > 0);

  async function start() {
    if (!ready) return;
    const t = text.trim();
    onError(null);
    try {
      let caseId = target !== NEW_TARGET && workflow ? target : null;
      if (!caseId) {
        setBusy("Creating case…");
        const title = (mode === "create" ? `${docKind}: ${t.split(/[.\n]/)[0]}` : t.split(/[.\n]/)[0] || files[0]?.name || "New case").slice(0, 80);
        const { case: c } = await api<{ case: { id: string } }>("/api/cases", { method: "POST", json: { title, description: mode === "create" ? "" : t } });
        caseId = c.id;
      }
      const ids: string[] = [];
      // Create: what was written becomes the case's first document
      if (mode === "create") {
        setBusy(`Saving the ${docKind.toLowerCase()}…`);
        const r = await api<{ result: { ok: boolean; evidence?: { id: string }; error?: string } }>(`/api/cases/${caseId}/evidence/text`, { method: "POST", json: { title: docKind, author: "", text: t } });
        if (r.result.evidence) ids.push(r.result.evidence.id);
      }
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append("files", f);
        const r = await fetch(`/api/cases/${caseId}/evidence`, { method: "POST", body: fd }).then((x) => x.json());
        if (r.results?.[0]?.ok) ids.push(r.results[0].evidence.id);
      }
      if (mode && workflow) {
        setBusy(`Starting ${workflow.name}…`);
        await api(`/api/workflows/${workflow.id}/run`, { method: "POST", json: { caseId, prompt: t } });
      } else if (t || ids.length) {
        await api(`/api/cases/${caseId}/messages`, { method: "POST", json: { text: mode === "create" ? "" : t, attachments: ids } });
      }
      router.push(`/cases/${caseId}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not start");
      setBusy(null);
    }
  }

  const placeholder =
    mode === "create"
      ? `Write the ${docKind.toLowerCase()}…`
      : mode === "analyse"
      ? "What should the analysis focus on? Attach evidence or pick a Vault folder below…"
      : mode === "review"
        ? "Anything specific to check? Pick the case to review below…"
          : "Describe a new case or ask anything…";

  // What the sheet above the input shows. It keeps the last view while it slides shut.
  const view: Mode | "browse" | null = browsing ? "browse" : mode;
  const [lastView, setLastView] = useState(view);
  if (view && view !== lastView) setLastView(view);
  const sheet = view ?? lastView;
  const sheetMode = sheet === "browse" ? null : sheet;
  const sheetM = MODES.find((x) => x.key === sheetMode);
  const sheetWorkflow = sheetMode === "analyse" || sheetMode === "review" ? builtIn(sheetMode) : undefined;

  // Panel rows: Vault folders for Analyse; cases for Review.
  const fromFiles = files.length ? `From ${files.length} attached file${files.length === 1 ? "" : "s"}` : "From your prompt and attachments";
  const caseRows: TargetRow[] =
    sheetMode === "analyse"
      ? [
          { id: NEW_TARGET, title: "New folder", subtitle: fromFiles, icon: "plus" },
          ...(vault.data?.folders ?? [])
            .filter((f) => !f.archived && f.files > 0)
            .map((f) => ({ id: f.id, title: f.title.replace(/^DEMO · /, ""), subtitle: `${f.files} file${f.files === 1 ? "" : "s"} · ${formatBytes(f.bytes)}`, icon: "vault" as IconName })),
        ]
      : [
          ...(files.length ? [{ id: NEW_TARGET, title: "New case", subtitle: fromFiles, icon: "plus" as IconName }] : []),
          ...cases
            .filter((c) => c.evidence_count > 0)
            .map((c) => ({ id: c.id, title: c.title.replace(/^DEMO · /, ""), subtitle: `${c.evidence_count} evidence · ${c.findings_count} findings`, icon: "folder" as IconName })),
        ];
  const targetTitle = caseRows.find((r) => r.id === target && r.id !== NEW_TARGET)?.title;

  const panelTitle = sheet === "browse" ? "Workflows" : sheetMode === "create" ? "Create a document" : sheetWorkflow?.name ?? sheetM?.label;
  const chips = workflows.slice(0, 3);

  return (
    <div
      // Focus anywhere in the composer counts, so tabbing from the input to a workflow keeps the row open.
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      className="rounded-3xl border border-border-button-default bg-background-primary-default p-px shadow-lg"
    >
      <Reveal open={expanded}>
        {sheet && (
          <div className="px-4 pt-3.5">
            <div className="flex items-center gap-2 pb-2">
              <p className="flex-1 text-[14px] font-medium">{panelTitle}</p>
              {sheet === "browse" && (
                <Link href="/workflows" className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] hover:bg-subtle">
                  <Icon name="workflow" size={16} /> Browse all
                </Link>
              )}
              <button onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                <Icon name="close" size={16} />
              </button>
            </div>

            {sheet === "browse" && (
              <ul className="scroll-panel -mx-1.5 max-h-[300px] pb-2" aria-label="Workflows">
                {workflows.map((w) => (
                  <li key={w.id}>
                    <button onClick={() => pickWorkflow(w)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-subtle">
                      <Icon name="workflow" size={17} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{w.name}</span>
                        <span className="block truncate text-[12.5px] text-muted">{w.description}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-faint">{w.steps.length} steps</span>
                    </button>
                  </li>
                ))}
                {workflows.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">No workflows yet.</li>}
              </ul>
            )}

            {sheetMode === "create" && (
              <div className="grid h-[280px] gap-3 pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <TargetList rows={DOC_KINDS.map((d) => ({ id: d.id, title: d.title, subtitle: d.description, icon: "text" }))} target={docKind} setTarget={setDocKind} label="Document" empty="" />
                <WorkflowPreview workflow={{ name: docKind, description: DOC_KINDS.find((d) => d.id === docKind)?.description ?? "" }} tint={sheetM?.tint ?? ""} empty="" />
              </div>
            )}

            {(sheetMode === "analyse" || sheetMode === "review") && (
              <div className="grid h-[280px] gap-3 pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <TargetList rows={caseRows} target={target} setTarget={setTarget} label={sheetMode === "review" ? "Case to review" : "Vault folder to analyse"} empty={sheetMode === "review" ? "No cases with evidence yet." : "No Vault folders with files yet."} />
                <WorkflowPreview workflow={sheetWorkflow} tint={sheetM?.tint ?? ""} empty="" />
              </div>
            )}
          </div>
        )}
      </Reveal>

      {/* Focused: a few workflows to start from, and the full list. Mouse down keeps focus in the input. */}
      <Reveal open={focused && !expanded}>
        <div onMouseDown={(e) => e.preventDefault()} className="flex items-center gap-1 px-3.5 py-2">
          {chips.map((w) => (
            <button key={w.id} onClick={() => pickWorkflow(w)} className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-subtle hover:text-ink">
              <Icon name="workflow" size={14} className="shrink-0" />
              <span className="truncate">{w.name}</span>
            </button>
          ))}
          <Link href="/workflows" className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-subtle hover:text-ink">
            <Icon name="workflow" size={16} /> All workflows
          </Link>
        </div>
      </Reveal>

      {/* The input: on its own by default, outlined when focused */}
      <div className={cx("flex items-center gap-1 rounded-[calc(var(--radius-3xl)-2px)] border bg-background-primary-default py-1.5 pl-4 pr-1.5 transition-shadow", focused ? "border-accent-600" : "border-border-button-default")}>
        {(files.length > 0 || targetTitle || mode === "create" || (m && workflow)) && (
          <span className="flex max-w-[45%] shrink-0 items-center gap-1.5 overflow-hidden">
            {mode === "create" && (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium">
                <Icon name="text" size={11} /> {docKind}
              </span>
            )}
            {m && workflow && !targetTitle && (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium">
                <Icon name="workflow" size={11} /> {workflow.name}
              </span>
            )}
            {mode && targetTitle && (
              <span className="flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md bg-subtle px-2 py-0.5 text-[11px]">
                <Icon name={mode === "analyse" ? "vault" : "folder"} size={11} /> <span className="truncate">{targetTitle}</span>
                <button aria-label="Use a new case instead" onClick={() => setTarget(NEW_TARGET)} className="text-faint hover:text-ink">×</button>
              </span>
            )}
            {files.map((f, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md bg-subtle px-2 py-0.5 text-[11px]">
                <Icon name="files" size={11} /> <span className="truncate">{f.name}</span>
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-faint hover:text-ink">×</button>
              </span>
            ))}
          </span>
        )}
        <textarea
          id="composer-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value === "/") setBrowsing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && expanded) close();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void start();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Prompt"
          className="block max-h-[160px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-6 outline-none [field-sizing:content] placeholder:text-faint focus-visible:outline-none"
        />
        {busy && <span className="shrink-0 truncate text-[12px] text-faint">{busy}</span>}
        <button onClick={() => fileRef.current?.click()} title="Attach evidence" aria-label="Attach evidence" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <Icon name="paperclip" size={17} />
        </button>
        <input ref={fileRef} type="file" multiple className="sr-only" accept=".mp4,.mov,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.csv,.md,.txt" onChange={(e) => { setFiles([...files, ...(e.target.files ?? [])]); e.target.value = ""; }} />
        {ready ? (
          <BoardButton
            onClick={() => void start()}
            aria-label={workflow ? `Run ${workflow.name}` : mode === "create" ? `Create ${docKind.toLowerCase()}` : "Create case"}
            variant="primary"
            size="small"
            iconOnly
            leadingIcon={RiArrowUpLine}
            className="size-9 shrink-0"
          />
        ) : (
          <Link href="/record" title="Record" aria-label="Record" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted hover:bg-hover hover:text-ink">
            <Icon name="mic" size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Slides its content open and shut by animating the row height, so the sheet grows from the input. */

interface TargetRow {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  /** A product's own logo in /public/logos, shown instead of the icon. */
  logo?: string;
}

function TargetList({ rows, target, setTarget, label, hideLabel, empty }: { rows: TargetRow[]; target: string; setTarget: (id: string) => void; label: string; hideLabel?: boolean; empty: string }) {
  return (
    <div className="flex min-h-0 flex-col">
      {!hideLabel && <p className="px-4 pb-1 text-[11px] font-medium text-faint">{label}</p>}
      {/* Padding keeps the selected row's shadow inside the scroll area */}
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto p-1" aria-label={label}>
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => setTarget(r.id)} aria-pressed={target === r.id} className={cx("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left", target === r.id ? "bg-panel shadow-[var(--shadow-card)]" : "hover:bg-hover")}>
              <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-md bg-panel text-muted shadow-[var(--shadow-card)]")}>
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/logos/${r.logo}`} alt="" className="h-4 w-4 object-contain" />
                ) : (
                  <Icon name={r.icon} size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.title}</span>
                <span className="block truncate text-[12px] text-muted">{r.subtitle}</span>
              </span>
              {target === r.id && <Icon name="check" size={14} className="text-ink" />}
            </button>
          </li>
        ))}
        {rows.filter((r) => r.id !== NEW_TARGET).length === 0 && <li className="px-3 py-4 text-[13px] text-muted">{empty}</li>}
      </ul>
    </div>
  );
}

function WorkflowPreview({ workflow, tint, empty }: { workflow?: { name: string; description: string }; tint: string; empty: string }) {
  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl bg-[#ededeb] p-4">
      {workflow ? (
        <>
          <p className="text-[13px] font-medium">{workflow.name}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{workflow.description}</p>
        </>
      ) : (
        <p className="text-[13px] text-muted">{empty}</p>
      )}
      <StackedDocs tint={tint} />
    </div>
  );
}

/** Decorative illustration: a small fan of evidence cards. */
function StackedDocs({ tint }: { tint: string }) {
  const card = "absolute h-[118px] w-[150px] rounded-lg border border-line bg-panel p-2.5 shadow-[0_8px_18px_-8px_rgb(0_0_0/0.25)]";
  const line = (w: string, extra = "") => <span className={cx("mb-1.5 block h-1.5 rounded-full bg-line", extra)} style={{ width: w }} />;
  return (
    <div aria-hidden className="pointer-events-none absolute -bottom-6 right-2 h-[150px] w-[260px]">
      <div className={card} style={{ right: 70, bottom: 6, transform: "rotate(-10deg)" }}>
        {line("70%")}
        {line("90%")}
        {line("55%")}
      </div>
      <div className={card} style={{ right: 30, bottom: 14, transform: "rotate(-3deg)" }}>
        {line("60%", "bg-current opacity-40 " + tint)}
        {line("85%")}
        {line("40%")}
        <span className={cx("mt-3 block h-5 w-5 rounded-full bg-current opacity-50", tint)} />
      </div>
      <div className={card} style={{ right: -10, bottom: 2, transform: "rotate(7deg)" }}>
        {line("75%")}
        {line("50%", "bg-current opacity-40 " + tint)}
        {line("80%")}
      </div>
    </div>
  );
}
