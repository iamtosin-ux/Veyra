"use client";

import { Button as BoardButton } from "@/components/base/buttons/button";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, useApi } from "@/lib/client";
import { DraftSourceContext, ErrorNote, cx } from "@/components/ui";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { DeleteCaseDialog } from "@/components/DeleteCaseDialog";
import { Menu } from "@/components/Menu";
import { toast } from "@/lib/toast";
import { LiveCasePack } from "@/components/LiveCasePack";
import { Icon, type IconName } from "@/components/Icon";
import { CaseChat, type ChatWork, type ResolvedRef } from "@/components/CaseChat";
import { SourceModal, type SourceCitation } from "@/components/SourceModal";
import type { CaseData, EvidenceItem } from "@/components/case/types";
import { EvidenceModal } from "@/components/EvidenceModal";
import { EvidenceList } from "@/components/case/EvidenceList";
import { FindingsTab } from "@/components/case/FindingsTab";
import { TimelineTab } from "@/components/case/TimelineTab";
import { SavedVersions } from "@/components/case/SavedVersions";
import { CaseOverview } from "@/components/case/CaseOverview";
import { ShareCaseDialog } from "@/components/case/ShareCaseDialog";
import { VersionPreview } from "@/components/case/VersionPreview";
import { CaseDetailsDialog, TransferOwnershipDialog } from "@/components/case/CaseDialogs";

type View = "overview" | "evidence" | "insights" | "timeline" | "pack";

const VIEWS: { key: View; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "info" },
  { key: "evidence", label: "Evidence", icon: "evidence" },
  { key: "insights", label: "Insights", icon: "insight" },
  { key: "timeline", label: "Timeline", icon: "timeline" },
  { key: "pack", label: "Version control", icon: "pack" },
];

// Older links used ?tab=; map them onto the current views.
const LEGACY: Record<string, View> = { evidence: "evidence", analysis: "insights", findings: "insights", timeline: "timeline", pack: "pack" };

export default function CasePage() {
  return (
    <Suspense>
      <CaseWorkspace />
    </Suspense>
  );
}

function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const raw = search.get("view");
  // Current panel names, plus older ?tab= links mapped onto them.
  const view: View | null = raw && VIEWS.some((v) => v.key === raw) ? (raw as View) : (LEGACY[raw ?? ""] ?? LEGACY[search.get("tab") ?? ""] ?? null);
  // Only the chronology widens, into its Gantt view; other drawers stay drawers.
  const [wide, setWide] = useState(false);
  const expanded = view === "timeline" && wide;
  const me = useApi<{ organisation: string; aiConfigured: boolean }>("/api/auth/me");
  const caseApi = useApi<CaseData>(`/api/cases/${caseId}`, { pollMs: 3000 });
  const latestPack = useApi<{ pack: { content: { version: number } } | null }>(`/api/cases/${caseId}/pack`, { pollMs: 15000 });
  const data = caseApi.data;
  const [source, setSource] = useState<SourceCitation | null>(null);
  const [chatKey, setChatKey] = useState(0);
  // On a phone the chat and the case take turns on screen; an open view covers both.
  const [phonePane, setPhonePane] = useState<"chat" | "case">("chat");
  // Work Veyra is doing for another part of the page, shown in the conversation as it happens.
  const [chatWork, setChatWork] = useState<ChatWork | null>(null);
  const [focusSection, setFocusSection] = useState<{ key: string; n: number } | null>(null);
  // A link with ?section= (from the inbox) scrolls that section into view once.
  const sectionParam = search.get("section");
  const [sectionFromUrl, setSectionFromUrl] = useState<string | null>(null);
  if (sectionParam && sectionParam !== sectionFromUrl) {
    setSectionFromUrl(sectionParam);
    setFocusSection((f) => ({ key: sectionParam, n: (f?.n ?? 0) + 1 }));
  }
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"rename" | "transfer" | null>(null);
  const [openItem, setOpenItem] = useState<EvidenceItem | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (next: View | null, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (next) p.set("view", next);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    router.push(`/cases/${caseId}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const openRef = (r: ResolvedRef) => {
    if (r.kind === "finding") go("insights", { sub: "findings", f: r.id });
    else if (r.kind === "evidence") go("evidence", { e: r.id });
    else if (r.evidence_id && r.source_reference) setSource({ evidenceId: r.evidence_id, evidenceType: r.evidence_type, source_reference: r.source_reference, observationId: r.id, label: r.label });
  };

  // Runs an action, refreshes the case and confirms it with a toast when given a message.
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await caseApi.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const latestVersion = latestPack.data?.pack?.content.version ?? 0;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cases/${caseId}`);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link. Copy it from the address bar instead.", { tone: "danger" });
    }
  };
  const viewLabel = VIEWS.find((v) => v.key === view)?.label;
  // A count beside the panel title, as on the evidence panel.
  const timelineCount = useApi<{ events: { review_status: string }[] }>(view === "timeline" ? `/api/cases/${caseId}/timeline` : null);
  const viewCount =
    view === "insights" ? data?.case.findings_count : view === "pack" ? latestVersion || null : view === "timeline" ? timelineCount.data?.events.filter((e) => e.review_status !== "rejected").length : null;

  return (
    <div className="flex h-screen bg-background-secondary-default">
      <Sidebar activeCaseId={caseId} variant="rail" autoCollapse={!!view} onExpand={() => view && go(null)} floatBelow={1280} />
      <div className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
      <div className="flex min-h-0 flex-1">
        {caseApi.error && <div className="flex-1 p-6"><ErrorNote>{caseApi.error}</ErrorNote></div>}
        {!data && !caseApi.error && <CaseSkeleton />}
        {data && (
          <DraftSourceContext.Provider value={data.case.is_demo ? "demo" : "ai"}>
            {/* Conversation */}
            {!expanded && (
              <section
                className={cx("flex w-[340px] shrink-0 flex-col border-r border-line max-md:w-full max-md:border-r-0 2xl:w-[400px]", (phonePane !== "chat" || view) && "max-md:hidden")}
                aria-label="Conversation"
              >
                <header className="flex h-14 shrink-0 items-center gap-1 px-3">
                  <Menu
                      width={180}
                      items={[
                        { label: "Rename", icon: "pencil", onSelect: () => setDialog("rename") },
                        { label: data.case.pinned ? "Unpin" : "Pin", icon: "pin", onSelect: () => void act(() => api(`/api/cases/${caseId}`, { method: "PATCH", json: { pinned: !data.case.pinned } }), data.case.pinned ? "Unpinned" : "Pinned") },
                        { label: "Copy link", icon: "link", onSelect: () => void copyLink() },
                        { kind: "separator" },
                        { label: "Transfer", icon: "transfer", onSelect: () => setDialog("transfer") },
                        {
                          label: data.case.archived ? "Unarchive" : "Archive",
                          icon: "archive",
                          onSelect: () =>
                            void act(async () => {
                              await api(`/api/cases/${caseId}`, { method: "PATCH", json: { archived: !data.case.archived } });
                              if (data.case.archived) return toast("Case restored");
                              toast("Case archived", { action: { label: "Undo", onClick: () => void api(`/api/cases/${caseId}`, { method: "PATCH", json: { archived: false } }).then(() => router.push(`/cases/${caseId}`)) } });
                              router.push("/cases");
                            }),
                        },
                        { kind: "separator" },
                        { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(true) },
                      ]}
                      trigger={({ toggle, ref, open }) => (
                        <button ref={ref} onClick={toggle} aria-expanded={open} className={cx("flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-medium hover:bg-hover", open && "bg-hover")}>
                          <span className="truncate">{data.case.title.replace(/^DEMO · /, "")}</span>
                          <Icon name="chevron" size={15} className="shrink-0 rotate-90 text-muted" />
                        </button>
                      )}
                    />
                  <button
                    onClick={() => void act(() => api(`/api/cases/${caseId}`, { method: "PATCH", json: { pinned: !data.case.pinned } }), data.case.pinned ? "Removed from favourites" : "Added to favourites")}
                    title={data.case.pinned ? "Remove from favourites" : "Add to favourites"}
                    aria-label={data.case.pinned ? "Remove from favourites" : "Add to favourites"}
                    aria-pressed={!!data.case.pinned}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
                  >
                    <Icon name={data.case.pinned ? "starFill" : "star"} size={16} className={data.case.pinned ? "text-ink" : ""} />
                  </button>
                  <button onClick={() => setPhonePane("case")} className="ml-auto h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-ink hover:bg-hover md:hidden">
                    Case
                  </button>
                </header>
                <div className="min-h-0 flex-1">
                  <CaseChat caseId={caseId} compact refreshKey={chatKey} working={chatWork} handlers={{ onOpenView: (v, p) => go(v as View, p), onPreviewVersion: setPreview, onOpenSource: openRef, onChanged: caseApi.reload }} />
                </div>
              </section>
            )}

            {/* Breadcrumb, toolbar and canvas */}
            <main className={cx("min-w-0 flex-1 flex-col bg-panel", expanded ? "hidden" : "flex", (phonePane !== "case" || view) && "max-md:hidden", view && "max-[1180px]:hidden")} aria-label="Case building space">
              <header className="flex h-14 shrink-0 items-center gap-3 px-3 md:px-6">
                <button onClick={() => setPhonePane("chat")} aria-label="Back to chat" title="Back to chat" className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink md:hidden">
                  <Icon name="arrowLeft" size={16} />
                </button>
                <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] max-lg:hidden">
                  <Link href="/cases" className="shrink-0 text-muted hover:text-ink">Cases</Link>
                  <span className="shrink-0 text-faint">/</span>
                  <span className="truncate font-medium text-ink">{data.case.title.replace(/^DEMO · /, "")}</span>
                </nav>
                {error && <p className="truncate text-[12px] text-danger">{error}</p>}
                <div className="ml-auto flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="Case views">
                  <BoardButton onClick={() => setSharing(true)} variant="secondary" size="small" className="mr-1">
                    Share
                  </BoardButton>
                  <span className="mx-1.5 h-5 w-px bg-line-strong max-md:hidden" aria-hidden />
                  {VIEWS.map((v) => (
                    <ToolButton key={v.key} icon={v.icon} label={v.key === "pack" && latestVersion ? `Version control · v${latestVersion}` : v.label} active={view === v.key} onClick={() => go(view === v.key ? null : v.key)} />
                  ))}
                </div>
              </header>
              <div className="flex min-h-0 flex-1">
                  <div className="scroll-panel min-w-0 flex-1">
                    {preview ? (
                      <VersionPreview caseId={caseId} packId={preview} onBack={() => setPreview(null)} />
                    ) : (
                    <LiveCasePack
                      data={data}
                      onOpen={(v, p) => go(v as View, p)}
                      onSource={setSource}
                      onChat={() => setChatKey((k) => k + 1)}
                      focusSection={focusSection}
                      aiConfigured={me.data?.aiConfigured ?? false}
                      onTemplateSwitch={({ phase, template: t }) => {
                        if (phase === "start") return setChatWork({ since: Date.now(), prompt: `Use the ${t.label} template`, steps: [`Reading the ${t.label} template`, ...t.sections.map((s) => `Laying out ${s.title}`)] });
                        if (phase === "failed") return setChatWork(null);
                        // Veyra's reply takes over from the working state as soon as it loads, so nothing blinks.
                        setChatKey((k) => k + 1);
                        void caseApi.reload();
                        setTimeout(() => setChatWork(null), 3000);
                      }}
                    />
                    )}
                  </div>
              </div>
            </main>
            {/* A view opens as a column beside the canvas, never over it. */}
            {view && (
              <aside className={cx("@container flex min-h-0 min-w-0 flex-col border-l border-line bg-panel max-[1180px]:flex-1 max-md:w-full max-md:border-l-0", expanded ? "flex-1" : "w-[340px] shrink-0 2xl:w-[400px]")} aria-label={viewLabel}>
                {view === "evidence" ? (
                  <div className="min-h-0 flex-1">
                    <EvidenceList data={data} highlight={search.get("e")} reload={() => void caseApi.reload()} onOpen={setOpenItem} onClose={() => go(null)} />
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 shrink-0 items-center gap-2 px-5">
                      <p className="text-[14px] text-ink">
                        {viewLabel}
                        {viewCount != null && <span className="text-muted"> · {viewCount}</span>}
                      </p>
                      <div className="-mr-2 ml-auto flex items-center gap-0.5">
                        {view === "timeline" && (
                          <button onClick={() => setWide((w) => !w)} aria-label={expanded ? "Collapse" : "Expand"} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                            <Icon name={expanded ? "minimize" : "maximize"} size={15} />
                          </button>
                        )}
                        <button onClick={() => go(null)} title="Close" aria-label="Close panel" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    </div>
                    <div className={cx("min-h-0 flex-1", !expanded && "overflow-y-auto")}>
                      {view === "insights" && <FindingsTab key={search.get("f") ?? ""} caseId={caseId} reload={caseApi.reload} initialFinding={search.get("f")} />}
                      {view === "timeline" && (
                        <TimelineTab
                          expanded={expanded}
                          caseId={caseId}
                          industry={data.case.industry}
                          names={new Map(data.evidence.map((e) => [e.id, e.original_filename]))}
                          onSource={(s) => setSource(s as SourceCitation)}
                        />
                      )}
                      {view === "pack" && <SavedVersions caseId={caseId} />}
                      {view === "overview" && <CaseOverview data={data} onGo={(v, p) => go(v as View, p)} onShare={() => setSharing(true)} onChanged={() => void caseApi.reload()} />}
                    </div>
                  </>
                )}
              </aside>
            )}
          {source && <SourceModal citation={source} onClose={() => setSource(null)} />}
          {openItem && (
            <EvidenceModal
              item={openItem}
              onClose={() => setOpenItem(null)}
              onChanged={() => void caseApi.reload()}
              onAsk={(text) => {
                setOpenItem(null);
                // The chat picks this up and puts it in its input, ready for a question.
                window.dispatchEvent(new CustomEvent("veyra:ask", { detail: text }));
              }}
            />
          )}
          {sharing && <ShareCaseDialog caseId={caseId} onClose={() => setSharing(false)} onSettings={() => { setSharing(false); setDialog("rename"); }} onChanged={() => void caseApi.reload()} />}
          {dialog === "rename" && <CaseDetailsDialog caseId={caseId} title={data.case.title.replace(/^DEMO · /, "")} description={data.case.description} onClose={() => setDialog(null)} onSaved={() => { toast("Case renamed"); void caseApi.reload(); }} />}
          {dialog === "transfer" && <TransferOwnershipDialog caseId={caseId} onClose={() => setDialog(null)} onTransferred={(name) => { toast(`Ownership transferred to ${name}`); void caseApi.reload(); }} />}
          {deleting && <DeleteCaseDialog caseId={caseId} reference={data.case.reference} title={data.case.title.replace(/^DEMO · /, "")} onClose={() => setDeleting(false)} onDeleted={() => router.push("/cases")} />}
          </DraftSourceContext.Provider>
        )}
      </div>
      </div>
    </div>
  );
}

function ToolButton({ icon, label, active, onClick, badge }: { icon: IconName; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cx("group relative grid h-8 w-8 place-items-center rounded-lg", active ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-muted hover:bg-hover hover:text-ink")}
    >
      <Icon name={icon} size={17} />
      {badge != null && <span className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full bg-draft px-1 text-center text-[9px] font-semibold leading-[15px] text-white">{badge}</span>}
    </button>
  );
}

/** While the case loads: the chat column and the canvas in outline, so a slow connection shows the layout at once. */
function CaseSkeleton() {
  const bar = "block h-3 animate-pulse rounded bg-subtle";
  return (
    <div className="flex min-w-0 flex-1" aria-busy="true" aria-label="Loading the case">
      <div className="flex w-[340px] shrink-0 flex-col gap-3 border-r border-line p-4 max-md:w-full max-md:border-r-0 2xl:w-[400px]">
        <span className={cx(bar, "h-4 w-2/3")} />
        <div className="flex-1" />
        <span className={cx(bar, "w-5/6")} />
        <span className={cx(bar, "w-3/4")} />
        <span className="mt-2 block h-[104px] animate-pulse rounded-2xl bg-subtle" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-6 pt-20 max-md:hidden">
        <span className={cx(bar, "h-6 w-1/2")} />
        <span className={cx(bar, "w-1/3")} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="mt-3 block h-28 animate-pulse rounded-3xl bg-subtle" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}
