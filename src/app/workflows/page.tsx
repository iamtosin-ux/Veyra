"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATES } from "@/lib/workflowTemplates";
import { api, useApi } from "@/lib/client";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { ErrorNote, cx } from "@/components/ui";
import { toast } from "@/lib/toast";
import { Menu, type MenuItem } from "@/components/Menu";
import type { IconName } from "@/components/Icon";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: "analyse" | "review" | "custom";
  steps: string[];
  instructions: string;
  is_default: boolean;
  updated_at: string;
  created_by_name?: string | null;
}

type Steps = Record<string, { label: string; description: string }>;

function iconFor(w: Workflow): IconName {
  if (w.steps.length === 1 && w.steps[0] === "integrity") return "shield";
  if (w.steps.includes("review") && !w.steps.includes("compare")) return "review";
  if (w.steps.includes("compare")) return "compare";
  if (w.kind === "analyse") return "analyse";
  return "workflow";
}

/** Saved workflows and templates: reusable step sequences that can run on any case. */
export default function WorkflowsPage() {
  const data = useApi<{ workflows: Workflow[]; steps: Steps }>("/api/workflows");
  const [tab, setTab] = useState<"yours" | "templates">("yours");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const steps = data.data?.steps ?? {};
  const list = data.data?.workflows ?? [];
  // Yours: workflows people in the workspace made. The built-in ones sit with the templates.
  const own = list.filter((w) => !w.is_default);
  const builtIn = list.filter((w) => w.is_default);
  const stepLine = (keys: string[]) => keys.map((k) => steps[k]?.label ?? k).join(" → ");

  const remove = async (w: Workflow) => {
    if (!window.confirm(`Delete “${w.name}”?`)) return;
    setError(null);
    try {
      await api(`/api/workflows/${w.id}`, { method: "DELETE" });
      toast(`Deleted “${w.name}”`, { tone: "danger" });
      await data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const blank = () => router.push("/workflows/new");

  return (
    <AppShell
      breadcrumb={<Crumb current>Workflows</Crumb>}
      actions={
        <Menu
          align="right"
          width={200}
          items={[
            { label: "Blank workflow", icon: "plus", onSelect: blank },
            { label: "From a template", icon: "workflow", onSelect: () => setTab("templates") },
          ]}
          trigger={({ toggle, ref, open }) => (
            <button ref={ref} onClick={toggle} aria-expanded={open} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary-hover">
              <Icon name="plus" size={12} /> New workflow
            </button>
          )}
        />
      }
    >
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[960px] px-8 pb-16 pt-10">
          <h1 className="text-[30px] font-medium ">Workflows</h1>
          <div className="mt-6 flex items-center gap-1">
            {(
              [
                ["yours", "Yours"],
                ["templates", "Templates"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={cx("h-8 rounded-full px-3.5 text-[14px]", tab === k ? "bg-subtle font-medium text-ink" : "text-muted hover:text-ink")}>
                {l}
              </button>
            ))}
          </div>
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

          <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2">
            {tab === "yours" ? (
              own.map((w) => (
                <WorkflowItem
                  key={w.id}
                  icon={iconFor(w)}
                  name={w.name}
                  description={w.description}
                  meta={stepLine(w.steps)}
                  byline={w.created_by_name ? `By ${w.created_by_name}` : undefined}
                  onOpen={() => router.push(`/workflows/${w.id}`)}
                  menu={[
                    { label: "Edit", icon: "pencil", onSelect: () => router.push(`/workflows/${w.id}`) },
                    { label: "Duplicate", icon: "copy", onSelect: () => router.push(`/workflows/new?from=${w.id}`) },
                    { label: "Delete", icon: "trash", danger: true, onSelect: () => void remove(w) },
                  ]}
                />
              ))
            ) : (
              <>
                {/* The built-in workflows Veyra runs, then templates to start a new one from */}
                {builtIn.map((w) => (
                  <WorkflowItem
                    key={w.id}
                    icon={iconFor(w)}
                    name={w.name}
                    description={w.description}
                    meta={stepLine(w.steps)}
                    byline="Built in"
                    onOpen={() => router.push(`/workflows/${w.id}`)}
                    menu={[
                      { label: "Edit", icon: "pencil", onSelect: () => router.push(`/workflows/${w.id}`) },
                      { label: "Duplicate", icon: "copy", onSelect: () => router.push(`/workflows/new?from=${w.id}`) },
                    ]}
                  />
                ))}
                {TEMPLATES.map((t) => (
                  <WorkflowItem
                    key={t.key}
                    icon={t.icon}
                    name={t.name}
                    description={t.description}
                    meta={stepLine(t.steps)}
                    onOpen={() => router.push(`/workflows/new?template=${t.key}`)}
                  />
                ))}
              </>
            )}
          </ul>
          {tab === "yours" && data.data && own.length === 0 && <p className="text-[14px] text-muted">No workflows yet.</p>}
        </div>
      </div>
    </AppShell>
  );
}

function WorkflowItem({ icon, name, description, meta, byline, onOpen, menu }: { icon: IconName; name: string; description: string; meta: string; byline?: string; onOpen: () => void; menu?: MenuItem[] }) {
  return (
    <li className="group relative">
      <button onClick={onOpen} className="flex w-full items-start gap-4 rounded-xl p-3 pr-10 text-left hover:bg-subtle">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-subtle text-muted group-hover:bg-panel">
          <Icon name={icon} size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{name}</span>
          {description && <span className="mt-0.5 block truncate text-[14px] text-muted">{description}</span>}
          <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-faint">
            <Icon name="workflow" size={14} className="shrink-0" />
            <span className="truncate">{meta}</span>
            {byline && <span className="shrink-0">· {byline}</span>}
          </span>
        </span>
      </button>
      {menu && (
        <div className="absolute right-2 top-3">
          <Menu
            align="right"
            width={170}
            items={menu}
            trigger={({ toggle, ref, open }) => (
              <button
                ref={ref}
                onClick={toggle}
                aria-label={`More options for ${name}`}
                aria-expanded={open}
                className={cx("grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink focus:opacity-100", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
              >
                <Icon name="moreH" size={16} />
              </button>
            )}
          />
        </div>
      )}
    </li>
  );
}
