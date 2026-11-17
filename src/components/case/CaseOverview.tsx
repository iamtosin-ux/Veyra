"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, formatDateTime, timeAgo, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon, type IconName } from "../Icon";
import { Menu } from "../Menu";
import { cx } from "../ui";
import type { CaseData } from "./types";
import type { CaseAccess } from "./ShareCaseDialog";

export const INDUSTRIES = ["Legal services", "Social housing", "Construction disputes", "HR investigations", "Health and social care", "Insurance claims", "Property management", "Other"];

interface Task {
  id: string;
  kind: string;
  title: string;
  detail: string;
  target: { view?: string; params?: Record<string, string>; section?: string };
  assignee?: string | null;
}

const KIND_ICON: Record<string, IconName> = { review_request: "humanReview", finding_review: "findings", web_approval: "globe", integrity: "shield", processing: "timeline", failed: "alert", not_analysed: "files" };
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-center gap-2 py-1">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13.5px]">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="px-5 pb-2 pt-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-1 text-[13px] text-muted hover:text-ink">
        {title}
        <Icon name="chevron" size={14} className={cx("transition-transform", open ? "-rotate-90" : "rotate-90")} />
      </button>
      {open && <dl className="mt-1">{children}</dl>}
    </section>
  );
}

/** A value that opens a dropdown: only the value itself is clickable. */
function Pick({ value, selected, empty, options, onPick }: { value: string | null; selected: string | null; empty: string; options: { id: string | null; label: string }[]; onPick: (id: string | null) => void }) {
  return (
    <Menu
      width={240}
      items={options.map((o) => ({ label: o.label, checked: o.id === selected, onSelect: () => o.id !== selected && onPick(o.id) }))}
      trigger={({ toggle, ref, open }) => (
        <button ref={ref} onClick={toggle} aria-expanded={open} className={cx("-ml-1.5 flex max-w-full items-center gap-1 rounded-lg px-1.5 py-0.5 hover:bg-hover", !value && "text-faint", open && "bg-hover")}>
          <span className="truncate">{value ?? empty}</span>
          <Icon name="chevron" size={13} className="shrink-0 rotate-90 text-faint" />
        </button>
      )}
    />
  );
}

function People({ people, empty }: { people: { key: string; name: string; pending?: boolean }[]; empty: string }) {
  if (!people.length) return <span className="text-faint">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {people.map((p) => (
        <span key={p.key} className="flex max-w-full items-center gap-1.5 rounded-lg bg-subtle py-0.5 pl-0.5 pr-2 text-[13px]" title={p.pending ? "Not joined yet" : undefined}>
          <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold", p.pending ? "border border-dashed border-line-strong text-muted" : "bg-[#d9822b] text-white")}>{initials(p.name)}</span>
          <span className="truncate">{p.name}</span>
        </span>
      ))}
    </span>
  );
}

/** The case at a glance: summary, editable details, people and what's outstanding. */
export function CaseOverview({ data, onGo, onShare, onChanged }: { data: CaseData; onGo: (view: string, params?: Record<string, string>) => void; onShare: () => void; onChanged: () => void }) {
  const c = data.case;
  const projects = useApi<{ projects: { id: string; name: string }[] }>("/api/projects");
  const access = useApi<CaseAccess>(`/api/cases/${c.id}/members`);
  const tasks = useApi<{ tasks: Task[] }>(`/api/cases/${c.id}/tasks`, { pollMs: 10000 });
  const [showTasks, setShowTasks] = useState(false);
  // Inviting, removing or transferring touches the case, so refresh the people when it changes.
  const reloadAccess = access.reload;
  useEffect(() => {
    void reloadAccess();
  }, [c.updated_at, reloadAccess]);

  const patch = async (json: Record<string, unknown>, done: string) => {
    try {
      await api(`/api/cases/${c.id}`, { method: "PATCH", json });
      toast(done);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { tone: "danger" });
    }
  };

  const project = projects.data?.projects.find((p) => p.id === c.project_id) ?? null;
  const owner = access.data?.owner;
  const managers = [
    ...(owner ? [{ key: owner.id, name: owner.name }] : []),
    ...(access.data?.members ?? []).filter((m) => m.role === "manager").map((m) => ({ key: m.id, name: m.name ?? m.email, pending: !m.joined })),
  ];
  const collaborators = (access.data?.members ?? []).filter((m) => m.role !== "manager").map((m) => ({ key: m.id, name: m.name ?? m.email, pending: !m.joined }));
  const taskList = tasks.data?.tasks ?? [];
  const industries = c.industry && !INDUSTRIES.includes(c.industry) ? [c.industry, ...INDUSTRIES] : INDUSTRIES;

  return (
    <div className="scroll-panel h-full bg-panel">
      <section className="px-5 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-medium">Summary</h3>
          {c.summary && (
            <span className="text-[12px] text-muted">{c.summary_source === "ai" ? "AI generated" : "Sample summary"}</span>
          )}
        </div>
        <p className={cx("mt-2 text-[14px] leading-relaxed", c.summary ? "text-ink" : "text-faint")}>{c.summary ?? "A summary appears once the case has been analysed."}</p>
      </section>

      <Section title="General">
        <Row label="Reference"><span className="tabular-nums text-[12.5px]">{c.reference}</span></Row>
        <Row label="Project">
          <Pick
            value={project?.name ?? null}
            selected={c.project_id ?? null}
            empty="No project"
            options={[{ id: null, label: "No project" }, ...(projects.data?.projects ?? []).map((p) => ({ id: p.id, label: p.name }))]}
            onPick={(id) => void patch({ project_id: id }, id ? "Moved to project" : "Removed from project")}
          />
        </Row>
        <Row label="Industry">
          <Pick value={c.industry} selected={c.industry} empty="Not set" options={industries.map((i) => ({ id: i, label: i }))} onPick={(id) => void patch({ industry: id }, "Industry updated")} />
        </Row>
        <Row label="Created"><span title={formatDateTime(c.created_at)}>{formatDateTime(c.created_at)}</span></Row>
        <Row label="Last updated"><span title={formatDateTime(c.updated_at)}>{timeAgo(c.updated_at)}</span></Row>
        <Row label="Case managers"><People people={managers} empty="None" /></Row>
        <Row label="Collaborators">
          <span className="flex flex-wrap items-center gap-1">
            <People people={collaborators} empty="" />
            <button onClick={onShare} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[13px] text-muted hover:bg-hover hover:text-ink">
              <Icon name="plus" size={13} /> Add
            </button>
          </span>
        </Row>
      </Section>

      <Section title="Review">
        <Row label="Evidence">
          <button onClick={() => onGo("evidence")} className="-ml-1.5 rounded-lg px-1.5 py-0.5 hover:bg-hover">{c.evidence_count} item{c.evidence_count === 1 ? "" : "s"}</button>
        </Row>
        <Row label="Findings">
          <button onClick={() => onGo("insights")} className="-ml-1.5 rounded-lg px-1.5 py-0.5 hover:bg-hover">
            {c.findings_needing_review > 0 ? <span className="text-draft">{c.findings_needing_review} to review</span> : `${c.findings_count} finding${c.findings_count === 1 ? "" : "s"}`}
          </button>
        </Row>
        <Row label="Tasks">
          <button onClick={() => setShowTasks(true)} className="-ml-1.5 rounded-lg px-1.5 py-0.5 hover:bg-hover">
            {taskList.length} pending
          </button>
        </Row>
      </Section>

      {showTasks && (
        <TasksOverlay
          tasks={taskList}
          onClose={() => setShowTasks(false)}
          onOpen={(t) => {
            setShowTasks(false);
            if (t.target.view) onGo(t.target.view, t.target.params);
            else onGo("pack");
          }}
        />
      )}
    </div>
  );
}

/** Every pending action on the case, with who it's with. */
function TasksOverlay({ tasks, onClose, onOpen }: { tasks: Task[]; onClose: () => void; onOpen: (t: Task) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <div className="animate-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Pending tasks" className="animate-dialog relative flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-semibold">Pending tasks <span className="font-normal text-faint">{tasks.length}</span></h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"><Icon name="close" size={17} /></button>
        </div>
        {tasks.length === 0 ? (
          <p className="px-5 pb-6 pt-2 text-[13.5px] text-muted">Nothing is waiting on anyone.</p>
        ) : (
          <ul className="scroll-panel min-h-0 flex-1 px-5 pb-3">
            {tasks.map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpen(t)} className="group flex w-full items-center gap-3 py-3 text-left">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted"><Icon name={KIND_ICON[t.kind] ?? "tasks"} size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium group-hover:underline">{t.title}</span>
                    {t.detail && <span className="block truncate text-[12.5px] text-muted">{t.detail}</span>}
                  </span>
                  {t.assignee ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-[13px]">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#6b4fc8] text-[10px] font-semibold text-white">{initials(t.assignee)}</span>
                      {t.assignee}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[13px] text-faint">Unassigned</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
