"use client";

import { InsightMenu } from "./case/InsightMenu";
import { EvidenceSectionBody, MapSectionBody, type CanvasSection } from "./case/CanvasSectionBodies";
import { ChronologyGantt } from "./ChronologyViews";
import type { ChronoEvent } from "./ChronologyChart";
import { Menu } from "./Menu";
import { toast } from "@/lib/toast";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { api, formatDateTime, useApi } from "@/lib/client";
import type { SourceReference } from "@/lib/types";
import type { CasePackContent, PackFinding } from "@/server/casepack";
import type { CaseData } from "./case/types";
import type { SourceCitation } from "./SourceModal";
import { Icon } from "./Icon";
import { Chip, Reveal, SLIDE, cx } from "./ui";
import { SectionReview, SectionSettingsMenu, SectionWebSources, type SectionSettings, type Assignment, type WebSource } from "./SectionTools";
import { PACK_SECTIONS, type SectionKey } from "@/lib/sections";
import { CANVAS_TEMPLATES, templateFor, type CanvasTemplate } from "@/lib/canvasTemplates";


// Numbered source chips cycle through these tints.
const CHIP_TINTS = ["bg-[#fbe3ef] text-[#b03a73]", "bg-[#ece6fb] text-[#6b4fc8]", "bg-[#e3eefb] text-[#2f5aa8]", "bg-[#e4f4ec] text-[#2f8f6a]"];

interface FindingSourceLite {
  observation_id: string;
  observation_reference: string;
  observation_description: string;
  evidence_id: string;
  evidence_reference: string;
  evidence_type: string;
  source_reference: SourceReference & { transcript_segment_ids?: string[] };
}

/**
 * The case-building space: the live draft of the case pack, split into
 * separate section cards that update as evidence is processed, findings are
 * reviewed and the conversation adds notes.
 */
export function LiveCasePack({
  data,
  onOpen,
  onSource,
  onChat,
  focusSection,
  aiConfigured,
  onTemplateSwitch,
}: {
  data: CaseData;
  onOpen: (view: string, params?: Record<string, string>) => void;
  onSource: (c: SourceCitation) => void;
  /** Something was posted to the conversation; the chat should refresh. */
  onChat: () => void;
  focusSection?: { key: string; n: number } | null;
  aiConfigured: boolean;
  /** A template change starting, finishing or failing, so the conversation can show Veyra working on it. */
  onTemplateSwitch?: (e: { phase: "start" | "done" | "failed"; template: CanvasTemplate }) => void;
}) {
  const busy = data.runs.some((r) => r.status === "queued" || r.status === "running");
  const poll = busy ? 2500 : 5000;
  const { data: preview, reload: reloadPreview } = useApi<{ pack: CasePackContent }>(`/api/cases/${data.case.id}/pack/preview`, { pollMs: poll });
  const { data: findingsData } = useApi<{ findings: { id: string; sources: FindingSourceLite[] }[] }>(`/api/cases/${data.case.id}/findings`, { pollMs: poll });
  // Sections added at the user's request, and the data they draw on.
  const canvasApi = useApi<{ sections: CanvasSection[] }>(`/api/cases/${data.case.id}/canvas`, { pollMs: poll });
  const added = canvasApi.data?.sections ?? [];
  // The template lays out the canvas for the type of case. A choice made here shows at once.
  const [chosen, setChosen] = useState<string | null>(null);
  const template = templateFor(chosen ?? data.case.canvas_template, data.case.case_type, data.case.industry);
  const has = (k: string) => template.sections.some((x) => x.key === k);
  // The Summary section: the case summary once there is one, else the description it was opened with.
  const summaryText = data.case.summary ?? data.case.description?.split(/\n\nDemonstration case built/)[0] ?? null;
  // Changing template: Veyra works on it in the conversation while the canvas shows the new layout's outline.
  const [switching, setSwitching] = useState<CanvasTemplate | null>(null);
  const chooseTemplate = async (t: CanvasTemplate) => {
    if (t.key === template.key || switching) return;
    const started = Date.now();
    setSwitching(t);
    onTemplateSwitch?.({ phase: "start", template: t });
    try {
      // Long enough to follow what Veyra is doing, which the conversation shows step by step.
      await new Promise((r) => setTimeout(r, 3600));
      await api(`/api/cases/${data.case.id}/template`, { method: "POST", json: { template: t.key, ms: Date.now() - started } });
      setChosen(t.key);
      onTemplateSwitch?.({ phase: "done", template: t });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change the template. Try again.", { tone: "danger" });
      onTemplateSwitch?.({ phase: "failed", template: t });
    } finally {
      setSwitching(null);
    }
  };
  // A section can be narrowed to some kinds of finding, e.g. only facts under "Defects and their history".
  const narrow = (items: PackFinding[], types?: string[]) => (types ? items.filter((f) => types.includes(f.finding_type)) : items);
  const timelineApi = useApi<{ events: ChronoEvent[] }>(added.some((x) => x.kind !== "evidence") ? `/api/cases/${data.case.id}/timeline` : null, { pollMs: 15000 });
  const events = (timelineApi.data?.events ?? []).filter((e) => e.review_status !== "rejected");
  const removeAdded = async (x: CanvasSection) => {
    await api(`/api/cases/${data.case.id}/canvas/${x.id}`, { method: "DELETE" });
    toast(`Removed “${x.title}” from the canvas`, { tone: "danger" });
    await canvasApi.reload();
    void assignApi.reload();
  };
  // A template's section is only hidden, so it can be added back.
  const removeDefault = async (k: string, title: string) => {
    await changeSettings(k)({ hidden: true });
    toast(`Removed “${title}” from the canvas`, { tone: "danger", action: { label: "Undo", onClick: () => void changeSettings(k)({ hidden: false }) } });
  };
  const sourcesById = useMemo(() => new Map((findingsData?.findings ?? []).map((f) => [f.id, f.sources])), [findingsData]);
  const pack = preview?.pack;
  const changed = useChangedSections(pack);

  const openSource = (s: FindingSourceLite) =>
    onSource({ evidenceId: s.evidence_id, evidenceType: s.evidence_type, source_reference: s.source_reference, observationId: s.observation_id, label: s.observation_description });

  const findingProps = (k: SectionKey) => ({ sourcesById, onOpen, openSource, citations: settingsFor(k).citations !== false, onChanged: () => void reloadPreview() });

  // Human-in-the-loop tags and web sources, per section.
  const assignApi = useApi<{ assignments: Assignment[] }>(`/api/cases/${data.case.id}/assignments`, { pollMs: 8000 });
  const webApi = useApi<{ sources: WebSource[] }>(`/api/cases/${data.case.id}/web-sources`, { pollMs: 5000 });
  const settingsApi = useApi<{ settings: Record<string, SectionSettings> }>(`/api/cases/${data.case.id}/sections`);
  const settingsFor = (k: string): SectionSettings => settingsApi.data?.settings[k] ?? {};
  const changeSettings = (k: string) => async (patch: SectionSettings) => {
    await api(`/api/cases/${data.case.id}/sections`, { method: "PATCH", json: { section: k, ...patch } });
    await settingsApi.reload();
  };
  const sectionText = (k: SectionKey) => () => {
    if (!pack) return "";
    const items = k === "findings" ? [...pack.reviewed_findings, ...pack.cross_evidence] : k === "discrepancies" ? pack.discrepancies : k === "questions" ? pack.open_questions : [];
    if (k === "notes") return pack.reviewer_notes.map((n) => `- ${n.text}`).join("\n");
    return items.map((f) => `- ${f.title}\n  ${f.description}`).join("\n");
  };
  const rerunDisabled = busy ? "Analysis is running" : !aiConfigured && !data.case.is_demo ? "AI not connected" : undefined;

  // The same header tools on every section: settings, review and approval, and more actions.
  const headerTools = (key: string, title: string, o: { copy?: () => string; remove: () => void; rerun?: Parameters<typeof SectionSettingsMenu>[0]["rerun"]; citations?: boolean; review?: boolean }) => {
    const st = settingsFor(key);
    return {
      sectionKey: key,
      highlight: focusSection?.key === key ? focusSection.n : 0,
      collapsed: !!st.collapsed,
      onToggle: () => void changeSettings(key)({ collapsed: !st.collapsed }),
      tools: (
        <>
          <SectionSettingsMenu title={title} sectionId={key} settings={st} onChange={changeSettings(key)} copyText={o.copy} rerun={o.rerun} citations={o.citations} />
          {o.review !== false && (
            <SectionReview
              caseId={data.case.id}
              section={key}
              assignments={(assignApi.data?.assignments ?? []).filter((a) => a.section === key)}
              reload={() => {
                void assignApi.reload();
                onChat();
              }}
            />
          )}
          <SectionMore title={title} onRemove={o.remove} />
        </>
      ),
    };
  };

  const tools = (k: SectionKey, title: string) => {
    const web = (webApi.data?.sources ?? []).filter((w) => w.section === k);
    return {
      ...headerTools(k, title, {
        copy: sectionText(k),
        remove: () => void removeDefault(k, title),
        citations: true,
        rerun:
          k === "notes"
            ? undefined
            : {
                disabled: rerunDisabled,
                run: async (instructions) => {
                  await api(`/api/cases/${data.case.id}/analyse`, { method: "POST", json: { focus: instructions.trim() ? `For "${PACK_SECTIONS[k]}": ${instructions.trim()}` : undefined } });
                  onChat();
                },
              },
      }),
      after: k === "evidence" ? null : <SectionWebSources sources={web.filter((w) => w.status === "approved")} />,
    };
  };

  const addedText = (x: CanvasSection) => () => {
    if (x.kind === "chronology") return events.map((e) => `- ${e.event_datetime ?? e.date_text ?? "Undated"}: ${e.description}`).join("\n");
    if (x.kind === "evidence") return data.evidence.map((e) => `- ${e.reference} ${e.original_filename}`).join("\n");
    return x.title;
  };

  return (
    <div className="@container mx-auto max-w-[760px] space-y-3 px-3 pb-16 pt-4 md:px-6">
      <div className="px-1 pb-3 pt-2">
        <h1 className="text-[24px] font-medium">{data.case.title.replace(/^DEMO · /, "")}</h1>
        <p className="mt-0.5 text-[12px] text-muted">
          {data.case.reference}
          {data.case.industry ? ` · ${data.case.industry}` : ""} · {data.case.evidence_count} evidence · {data.case.findings_count} findings
        </p>
        <div className="mt-4">
          <TemplatePicker template={switching ?? template} busy={!!switching} onPick={(t) => void chooseTemplate(t)} />
        </div>
      </div>


      {/* Wait for the saved open/closed state too, so sections don't open and then snap shut on load. */}
      {switching ? (
        <div className="space-y-3" aria-busy="true" aria-label={`Laying out the ${switching.label} template`}>
          {switching.sections.map((sec, i) => (
            <SkeletonCard key={sec.key} title={sec.title} lines={i === 0 ? 2 : 3} />
          ))}
        </div>
      ) : !pack || (!settingsApi.data && !settingsApi.error) ? (
        <p className="px-2 text-[13px] text-faint">Building draft…</p>
      ) : (
        <>
          {template.sections.map((sec) => {
            if (settingsFor(sec.key).hidden || !has(sec.key)) return null;
            switch (sec.key) {
              case "summary":
                return (
                  <SectionCard
                    key={sec.key}
                    title={sec.title}
                    processing={busy}
                    // The summary is rewritten by analysis, so it can be re-run with a prompt; it isn't assigned for review.
                    {...headerTools(sec.key, sec.title, {
                      remove: () => void removeDefault(sec.key, sec.title),
                      citations: false,
                      review: false,
                      rerun: {
                        disabled: rerunDisabled,
                        run: async (instructions) => {
                          await api(`/api/cases/${data.case.id}/analyse`, { method: "POST", json: { focus: instructions.trim() ? `For the case summary: ${instructions.trim()}` : undefined } });
                          onChat();
                        },
                      },
                    })}
                  >
                    {summaryText ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{summaryText}</p> : <Placeholder>{sec.empty}</Placeholder>}
                  </SectionCard>
                );
              case "findings":
              case "discrepancies":
              case "questions": {
                const pool = sec.key === "findings" ? [...pack.reviewed_findings, ...pack.cross_evidence] : sec.key === "discrepancies" ? pack.discrepancies : pack.open_questions;
                const items = narrow(pool, sec.types);
                return (
                  <SectionCard key={sec.key} title={sec.title} {...tools(sec.key, sec.title)} count={items.length} flash={changed.has(sec.key)} processing={busy}>
                    <FindingList items={items} empty={sec.empty} {...findingProps(sec.key)} />
                  </SectionCard>
                );
              }
              case "notes":
                return (
                  <SectionCard key={sec.key} title={sec.title} {...tools("notes", sec.title)} count={pack.reviewer_notes.length} flash={changed.has("notes")}>
                    {pack.reviewer_notes.length === 0 ? (
                      <Placeholder>{sec.empty}</Placeholder>
                    ) : (
                      <ul className="space-y-2">
                        {pack.reviewer_notes.map((n) => (
                          <li key={n.reference}>
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{n.text}</p>
                            <p className="mt-0.5 text-[11px] text-faint">
                              {n.author ?? "Reviewer"} · {formatDateTime(n.added_at)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionCard>
                );
            }
          })}
          {added
            // A chronology or evidence list the template already shows isn't repeated.
            .filter((x) => !settingsFor(`canvas:${x.id}`).hidden && !(x.kind !== "map" && has(x.kind)))
            .map((x) => (
            <SectionCard
              key={x.id}
              title={x.title}
              count={x.kind === "chronology" ? events.length : x.kind === "evidence" ? data.evidence.length : undefined}
              {...headerTools(`canvas:${x.id}`, x.title, { copy: addedText(x), remove: () => void removeAdded(x), citations: false })}
            >
              {x.kind === "chronology" && (
                // The same Gantt grid as the expanded timeline, at a fixed height on the canvas.
                <div className="-mx-4 -my-3.5 h-[440px] overflow-hidden rounded-b-2xl">
                  <ChronologyGantt compact events={events} onSource={(c) => onSource(c as SourceCitation)} />
                </div>
              )}
              {x.kind === "evidence" && <EvidenceSectionBody evidence={data.evidence} onOpen={(id) => onOpen("evidence", { e: id })} />}
              {x.kind === "map" && <MapSectionBody config={x.config} events={events} />}
            </SectionCard>
          ))}
          {template.sections.some((x) => settingsFor(x.key).hidden && has(x.key)) && (
            <p className="px-2 text-[12px] text-muted">
              Add back:{" "}
              {template.sections
                .filter((x) => settingsFor(x.key).hidden && has(x.key))
                .map((x, i) => (
                  <span key={x.key}>
                    {i > 0 && ", "}
                    <button onClick={() => void changeSettings(x.key)({ hidden: false })} className="underline underline-offset-2 hover:text-ink">
                      {x.title}
                    </button>
                  </span>
                ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  count,
  children,
  flash,
  processing,
  action,
  extra,
  sectionKey,
  tools,
  after,
  highlight = 0,
  collapsed,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  sectionKey?: string;
  tools?: ReactNode;
  after?: ReactNode;
  highlight?: number;
  title: string;
  count?: number;
  children: ReactNode;
  flash?: boolean;
  /** Analysis is reworking this section after a change. */
  processing?: boolean;
  action?: { label: string; run: () => void };
  extra?: ReactNode;
}) {
  // Opens and closes at once on click; the saved setting follows in the background.
  const [open, setOpen] = useState(!collapsed);
  const [saved, setSaved] = useState(collapsed);
  // Only a click animates; a saved state arriving from the server applies without motion.
  const [animate, setAnimate] = useState(false);
  if (collapsed !== saved) {
    setSaved(collapsed);
    if (open !== !collapsed) {
      setOpen(!collapsed);
      setAnimate(false);
    }
  }
  const toggle = () => {
    setAnimate(true);
    setOpen((o) => !o);
    onToggle?.();
  };
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(false);
  // Opened from the task strip: scroll into view and highlight briefly.
  useEffect(() => {
    if (!highlight) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const on = setTimeout(() => setLit(true), 0);
    const off = setTimeout(() => setLit(false), 1600);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [highlight]);
  return (
    // A border beam runs while the section is being reworked or has just changed. The beam's wrapper
    // clips its contents, so the card outline and highlight ring sit on the wrapper, not the section.
    <BorderBeam
      active={!!processing || !!flash}
      theme="light"
      colorVariant="sunset"
      size="md"
      strength={0.8}
      borderRadius={12}
      className={cx("rounded-3xl border border-border-button-default shadow-xs ring-2 transition-[box-shadow] duration-[1500ms]", lit ? "ring-[#f5d78a]" : "ring-transparent")}
    >
    <section ref={ref} id={sectionKey ? `section-${sectionKey}` : undefined} className="scroll-mt-3 rounded-3xl bg-panel">
      <div className="flex items-center gap-2 bg-background-secondary-default px-4 py-3 md:px-5">
        <button onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="line-clamp-2 min-w-0 text-[13px] font-medium leading-snug text-ink">{title}</span>
          {count != null && count > 0 && <span className="rounded-md bg-subtle px-1.5 text-[11px] text-muted">{count}</span>}
          <Icon name="chevron" size={14} className={cx("shrink-0 text-faint", animate && `transition-transform ${SLIDE}`, open && "rotate-90")} />
        </button>
        {extra}
        {tools && <span className="flex shrink-0 items-center gap-0.5">{tools}</span>}
        {action && (
          <button onClick={action.run} className="shrink-0 text-[12px] text-accent hover:underline">
            {action.label}
          </button>
        )}
      </div>
      <Reveal open={open} instant={!animate}>
        <div className="px-4 py-3.5">
          {children}
          {after}
        </div>
      </Reveal>
    </section>
    </BorderBeam>
  );
}

/** Chooses the canvas template. */
function TemplatePicker({ template, busy, onPick }: { template: CanvasTemplate; busy?: boolean; onPick: (t: CanvasTemplate) => void }) {
  return (
    <Menu
      width={220}
      items={CANVAS_TEMPLATES.map((t) => ({ label: t.label, checked: t.key === template.key, onSelect: () => onPick(t) }))}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={toggle}
          disabled={busy}
          aria-busy={busy}
          aria-haspopup="menu"
          aria-expanded={open}
          // Same as a small secondary button, like Share.
          className={cx(
            "button-press-motion flex h-8 min-w-0 max-w-full items-center gap-1 rounded-lg border border-border-button-default bg-background-primary-default pl-2.5 pr-1.5 text-body-medium text-text-primary shadow-xs hover:border-border-button-hover hover:bg-background-primary-hover",
            open && "border-border-button-hover bg-background-primary-hover",
          )}
        >
          <span className="truncate">Template: {template.label}</span>
          <Icon name="chevron" size={16} className={cx("shrink-0 text-muted transition-transform duration-150", open ? "-rotate-90" : "rotate-90")} />
        </button>
      )}
    />
  );
}

function SectionMore({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <Menu
      align="right"
      width={200}
      items={[{ label: "Remove from canvas", icon: "trash", danger: true, onSelect: onRemove }]}
      trigger={({ toggle, ref, open }) => (
        <button ref={ref} onClick={toggle} aria-expanded={open} aria-label={`${title} options`} className={cx("grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink", open && "bg-hover text-ink")}>
          <Icon name="moreH" size={15} />
        </button>
      )}
    />
  );
}

/** A section's outline while a new template is laid out: its real title, with its content still to come. */
function SkeletonCard({ title, lines }: { title: string; lines: number }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border-button-default shadow-xs">
      <div className="flex items-center gap-2 bg-background-secondary-default px-4 py-3 md:px-5">
        <span className="text-[13px] font-medium text-muted">{title}</span>
        <span className="ml-auto h-4 w-16 animate-pulse rounded bg-subtle" />
      </div>
      <div className="space-y-2.5 bg-panel px-4 py-4">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="block h-3 animate-pulse rounded bg-subtle" style={{ width: `${[92, 78, 64][i % 3]}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-faint">{children}</p>;
}

function FindingList({
  items,
  empty,
  sourcesById,
  onOpen,
  openSource,
  citations,
  onChanged,
}: {
  items: PackFinding[];
  empty: string;
  sourcesById: Map<string, FindingSourceLite[]>;
  onOpen: (v: string, p?: Record<string, string>) => void;
  openSource: (s: FindingSourceLite) => void;
  citations: boolean;
  onChanged: () => void;
}) {
  if (!items.length) return <Placeholder>{empty}</Placeholder>;
  return (
    <ul className="">
      {items.map((f) => (
        <FindingItem key={f.reference} f={f} sources={citations ? sourcesById.get(f.id) ?? [] : []} onOpen={onOpen} openSource={openSource} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function FindingItem({ f, sources, onOpen, openSource, onChanged }: { f: PackFinding; sources: FindingSourceLite[]; onOpen: (v: string, p?: Record<string, string>) => void; openSource: (s: FindingSourceLite) => void; onChanged: () => void }) {
  const [reasoning, setReasoning] = useState(false);
  const hasReasoning = !!(f.relationship_explanation || f.limitations);
  return (
    <li className="group py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
      <button onClick={() => onOpen("insights", { sub: "findings", f: f.id })} className="min-w-0 flex-1 text-left">
        <span className="text-[13.5px] font-medium leading-snug hover:underline">{f.title}</span>
        {f.review_status !== "unreviewed" && (
          <span className="ml-2 inline-block align-middle">
            <Chip tone={f.review_status === "rejected" ? "danger" : f.review_status === "corrected" ? "info" : "ok"}>
              {f.review_status === "rejected" ? "Rejected" : f.review_status === "corrected" ? "Corrected" : "Accepted"}
            </Chip>
          </span>
        )}
      </button>
        <InsightMenu id={f.id} status={f.review_status} onOpen={() => onOpen("insights", { sub: "findings", f: f.id })} onChanged={onChanged} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100" />
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {sources.map((s, i) => (
          <button
            key={s.observation_id}
            onClick={() => openSource(s)}
            title={`${s.evidence_reference}: ${s.observation_description}`}
            aria-label={`Source ${i + 1}: ${s.observation_description}`}
            className={cx("grid h-[18px] min-w-[18px] place-items-center rounded-[5px] px-1 text-[11px] font-medium hover:brightness-95", CHIP_TINTS[i % CHIP_TINTS.length])}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {!!f.precedents?.length && (
        <ul className="mt-2 space-y-0.5">
          {f.precedents.map((p) => (
            <li key={p.url} className="flex items-baseline gap-1.5 text-[12px] text-muted">
              <Icon name="scales" size={12} className="shrink-0 translate-y-[2px] text-faint" />
              <a href={p.url} target="_blank" rel="noreferrer noopener" className="truncate hover:text-ink hover:underline">
                {p.title}
                {p.citation && <span className="ml-1 tabular-nums">{p.citation}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {hasReasoning && (
        <div className="mt-1.5">
          <button onClick={() => setReasoning((r) => !r)} aria-expanded={reasoning} className="flex items-center gap-1 text-[12px] text-faint hover:text-muted">
            Reasoning <Icon name="chevron" size={11} className={cx("transition-transform", reasoning ? "rotate-90" : "")} />
          </button>
          {reasoning && (
            <div className="mt-1 space-y-1 text-[12px] leading-relaxed text-muted">
              {f.relationship_explanation && <p>{f.relationship_explanation}</p>}
              {f.limitations && <p className="text-draft">{f.limitations}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Which sections changed since the previous poll, for a brief highlight. */
function useChangedSections(pack: CasePackContent | undefined) {
  const prev = useRef<Record<string, string> | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!pack) return;
    const now: Record<string, string> = {
      evidence: JSON.stringify(pack.evidence_inventory.map((e) => e.reference)),
      findings: JSON.stringify([...pack.reviewed_findings, ...pack.cross_evidence].map((f) => [f.reference, f.review_status, f.title])),
      discrepancies: JSON.stringify(pack.discrepancies.map((f) => [f.reference, f.review_status])),
      chronology: JSON.stringify([...pack.chronology, ...pack.undated_events].map((e) => [e.when, e.description, e.status_label])),
      questions: JSON.stringify(pack.open_questions.map((f) => [f.reference, f.review_status])),
      notes: JSON.stringify(pack.reviewer_notes.map((n) => [n.reference, n.analysed])),
    };
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const diff = new Set(Object.keys(now).filter((k) => now[k] !== before[k]));
    if (!diff.size) return;
    const t1 = setTimeout(() => setChanged(diff), 0);
    const t2 = setTimeout(() => setChanged(new Set()), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pack]);
  return changed;
}
