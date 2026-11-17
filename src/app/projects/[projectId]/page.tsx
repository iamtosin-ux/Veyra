"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { AppShell, Crumb } from "@/components/AppShell";
import { CasePreviewCard, type CaseItem } from "@/components/CaseCard";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { Button, ErrorNote, cx, inputCls } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  description: string;
  cases: CaseItem[];
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const project = useApi<{ project: Project }>(`/api/projects/${projectId}`);
  const all = useApi<{ cases: CaseItem[] }>("/api/cases");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ name: string; description: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const p = project.data?.project;
  const available = useMemo(() => (all.data?.cases ?? []).filter((c) => c.project_id !== projectId), [all.data, projectId]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await Promise.all([project.reload(), all.reload()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };
  const assign = (caseId: string, id: string | null) => run(() => api(`/api/cases/${caseId}`, { method: "PATCH", json: { project_id: id } }));

  return (
    <AppShell
      breadcrumb={
        <>
          <Crumb href="/projects">Projects</Crumb>
          <Crumb current>{p?.name ?? "…"}</Crumb>
        </>
      }
      actions={
        <>
          <Button size="sm" onClick={() => setAdding((a) => !a)}>
            <Icon name="plus" size={13} /> Add cases
          </Button>
          <Menu
            align="right"
            width={190}
            items={[
              { label: "Edit details", icon: "pencil", onSelect: () => p && setEditing({ name: p.name, description: p.description }) },
              {
                label: "Remove project",
                icon: "trash",
                danger: true,
                onSelect: () =>
                  void run(async () => {
                    if (!window.confirm("Remove this project? Its cases are kept.")) return;
                    await api(`/api/projects/${projectId}`, { method: "DELETE" });
                    toast("Project removed", { tone: "danger" });
                    router.push("/projects");
                  }),
              },
            ]}
            trigger={({ toggle, ref, open }) => (
              <button ref={ref} onClick={toggle} aria-label="Project options" aria-expanded={open} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                <Icon name="moreH" size={16} />
              </button>
            )}
          />
        </>
      }
    >
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[960px] px-8 pb-16 pt-10">
          {editing ? (
            <div className="space-y-2">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Project name" className={inputCls} />
              <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} aria-label="Description" placeholder="Description" rows={4} className={cx(inputCls, "resize-y")} />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => void run(() => api(`/api/projects/${projectId}`, { method: "PATCH", json: editing })).then(() => setEditing(null))}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-[26px] font-medium ">{p?.name}</h1>
              {p?.description && <p className="mt-1 text-[13px] text-muted">{p.description}</p>}
            </>
          )}
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

          {adding && (
            <div className="mt-6 rounded-2xl border border-line p-3">
              <p className="px-1 pb-2 text-[12px] font-medium text-muted">Add a case to this project</p>
              <ul className="max-h-64 space-y-0.5 overflow-auto">
                {available.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => void assign(c.id, projectId)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover">
                      <span className="truncate">{c.title.replace(/^DEMO · /, "")}</span>
                      <span className="text-[11px] text-faint">{c.project_id ? "Move here" : "Add"}</span>
                    </button>
                  </li>
                ))}
                {available.length === 0 && <li className="px-2 py-2 text-[13px] text-muted">Every case is already in this project.</li>}
              </ul>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(p?.cases ?? []).map((c) => (
              <CasePreviewCard
                key={c.id}
                c={c}
                action={
                  <button onClick={() => void assign(c.id, null)} className="rounded-lg bg-panel px-2 py-1 text-[11px] text-muted shadow-[var(--shadow-card)] hover:text-ink">
                    Remove from project
                  </button>
                }
              />
            ))}
            {p && p.cases.length === 0 && !adding && (
              <div className="col-span-full rounded-2xl bg-[#f7f7f6] px-6 py-12 text-center">
                <p className="text-[14px] font-medium">No cases in this project</p>
                <Button className="mt-3" onClick={() => setAdding(true)}>Add cases</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
