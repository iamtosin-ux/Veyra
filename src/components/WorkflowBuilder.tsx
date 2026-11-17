"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { STEP_ICON } from "@/lib/workflowTemplates";
import { Icon, type IconName } from "./Icon";
import { Menu } from "./Menu";
import { toast } from "@/lib/toast";
import { Popover } from "./Popover";
import { Button, ErrorNote, Field, cx, inputCls } from "./ui";

type Steps = Record<string, { label: string; description: string }>;

export interface WorkflowDraft {
  id?: string;
  name: string;
  description: string;
  steps: string[];
  instructions: string;
  is_default?: boolean;
}

/**
 * Full-screen canvas for building a workflow: a trigger, optional
 * instructions, the steps in the order they run, and where the result goes.
 * Saving asks for a name and description.
 */
export function WorkflowBuilder({ initial }: { initial: WorkflowDraft }) {
  const router = useRouter();
  const stepsApi = useApi<{ steps: Steps }>("/api/workflows");
  const catalogue = stepsApi.data?.steps ?? {};
  const order = Object.keys(catalogue);
  const [steps, setSteps] = useState<string[]>(initial.steps);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = steps.join() !== initial.steps.join() || instructions !== initial.instructions;

  // Steps always run in the catalogue's order, so the canvas shows them that way.
  const ordered = order.length ? order.filter((k) => steps.includes(k)) : steps;
  const available = order.filter((k) => !steps.includes(k));

  const close = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    router.push("/workflows");
  };

  const remove = async () => {
    if (!initial.id || !window.confirm(`Delete “${initial.name}”?`)) return;
    try {
      await api(`/api/workflows/${initial.id}`, { method: "DELETE" });
      toast(`Deleted “${initial.name}”`, { tone: "danger" });
      router.push("/workflows");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const addStep = (
    <Popover
      align="left"
      width={360}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={toggle}
          aria-expanded={open}
          className="mx-auto flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-panel px-4 text-[13px] text-muted hover:border-line-strong hover:text-ink"
        >
          <Icon name="plus" size={15} /> Add step
        </button>
      )}
    >
      {(closeMenu) => (
        <ul className="p-1.5">
          {available.map((k) => (
            <li key={k}>
              <button
                onClick={() => {
                  setSteps([...steps, k]);
                  closeMenu();
                }}
                className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                  <Icon name={STEP_ICON[k] ?? "workflow"} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{catalogue[k].label}</span>
                  <span className="block text-[12px] text-muted">{catalogue[k].description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );

  return (
    <div className="flex h-screen flex-col bg-panel">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <button onClick={close} aria-label="Back to workflows" title="Back to workflows" className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-hover">
          <Icon name="arrowLeft" size={18} />
        </button>
        <p className="truncate text-[15px] font-medium">{initial.name || "New workflow"}</p>
        <button onClick={() => setSaving(true)} aria-label="Rename" title="Rename" className="grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-hover hover:text-ink">
          <Icon name="pencil" size={14} />
        </button>
        {initial.is_default && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted">Built in</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[13px] text-faint">{!initial.id ? "Not saved yet" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          {initial.id && !initial.is_default && (
            <Menu
              align="right"
              width={170}
              items={[{ label: "Delete workflow", icon: "trash", danger: true, onSelect: () => void remove() }]}
              trigger={({ toggle, ref, open }) => (
                <button ref={ref} onClick={toggle} aria-label="More options" aria-expanded={open} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                  <Icon name="moreH" size={17} />
                </button>
              )}
            />
          )}
          <Button variant="primary" disabled={ordered.length === 0} onClick={() => setSaving(true)}>
            Save workflow
          </Button>
        </div>
      </header>

      {error && <div className="px-4 pt-3"><ErrorNote>{error}</ErrorNote></div>}

      {/* Canvas */}
      <main className="relative min-h-0 flex-1 bg-canvas bg-[radial-gradient(circle,oklch(0.87_0_0)_1px,transparent_1px)] [background-size:20px_20px]">
        <div className="scroll-panel h-full">
        {ordered.length === 0 ? (
          <div className="grid h-full place-items-center">
            {addStep}
          </div>
        ) : (
        <div className="mx-auto flex w-full max-w-[440px] origin-top flex-col items-stretch px-4 py-12 transition-transform" style={{ transform: `scale(${zoom})` }}>
          <Node icon="play" title="When it runs" subtle>
            Deployed on a case together with your prompt.
          </Node>
          <Connector />
          <Node icon="pencil" title="Instructions for Veyra" subtle>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              readOnly={locked}
              rows={3}
              placeholder="Optional. e.g. Focus on times and who did what."
              className={cx(inputCls, "mt-2 resize-y bg-panel text-[13px]")}
            />
          </Node>

          {ordered.map((k, i) => (
            <div key={k} className="flex flex-col">
              <Connector />
              <Node
                icon={STEP_ICON[k] ?? "workflow"}
                title={catalogue[k]?.label ?? k}
                badge={`Step ${i + 1}`}
                onRemove={locked ? undefined : () => setSteps(steps.filter((x) => x !== k))}
              >
                {catalogue[k]?.description}
              </Node>
            </div>
          ))}

          <Connector />
          {locked ? null : available.length > 0 ? addStep : <p className="mx-auto text-[12px] text-faint">All steps added</p>}
          <Connector />
          <Node icon="pack" title="Result" subtle>
            A report in the case chat, with the case pack updated. Nothing is treated as reviewed until a person accepts it.
          </Node>
        </div>
        )}
        </div>

        {/* Canvas controls */}
        <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
          {(
            [
              ["plus", "Zoom in", () => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))],
              ["minus", "Zoom out", () => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))],
              ["maximize", "Reset zoom", () => setZoom(1)],
              [locked ? "lock" : "unlock", locked ? "Unlock editing" : "Lock editing", () => setLocked((l) => !l)],
            ] as const
          ).map(([icon, label, run]) => (
            <button key={label} onClick={run} title={label} aria-label={label} aria-pressed={icon === "lock" ? true : undefined} className="grid h-8 w-8 place-items-center text-muted last:border-b-0 hover:bg-hover hover:text-ink">
              <Icon name={icon} size={15} />
            </button>
          ))}
        </div>
      </main>

      {saving && (
        <SaveModal
          initial={initial}
          onClose={() => setSaving(false)}
          onSave={async (name, description) => {
            const body = { name, description, steps: ordered, instructions };
            if (initial.id) {
              await api(`/api/workflows/${initial.id}`, { method: "PATCH", json: body });
              toast("Workflow saved");
              router.push("/workflows");
            } else {
              await api("/api/workflows", { method: "POST", json: body });
              toast("Workflow created");
              router.push("/workflows");
            }
          }}
        />
      )}
    </div>
  );
}

function Connector() {
  return <span aria-hidden className="mx-auto h-7 w-px bg-line-strong" />;
}

function Node({ icon, title, badge, subtle, onRemove, children }: { icon: IconName; title: string; badge?: string; subtle?: boolean; onRemove?: () => void; children: ReactNode }) {
  return (
    <section className={cx("group relative rounded-2xl border p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]", subtle ? "border-line bg-panel/80" : "border-line-strong bg-panel")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", subtle ? "bg-subtle text-muted" : "bg-primary text-white")}>
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-medium">{title}</p>
            {badge && <span className="text-[11px] text-faint">{badge}</span>}
          </div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</div>
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          title="Remove step"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-muted opacity-0 hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          <Icon name="close" size={15} />
        </button>
      )}
    </section>
  );
}

function SaveModal({ initial, onClose, onSave }: { initial: WorkflowDraft; onClose: () => void; onSave: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), description.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Save workflow"
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold">Save workflow</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder="e.g. Disrepair claim check" className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What it's for" className={cx(inputCls, "resize-y")} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
