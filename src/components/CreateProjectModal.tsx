"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { toast } from "@/lib/toast";
import { Button, ErrorNote, Field, cx, inputCls } from "./ui";

/** Name a new project and open it, or edit an existing project's name and description. */
export function CreateProjectModal({ onClose, project, onSaved }: { onClose: () => void; project?: { id: string; name: string; description: string; visibility?: "private" | "public" }; onSaved?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [visibility, setVisibility] = useState<"private" | "public">(project?.visibility ?? "private");
  const me = useApi<{ organisation: string }>("/api/auth/me");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (project) {
        await api(`/api/projects/${project.id}`, { method: "PATCH", json: { name, description, visibility } });
        toast("Project saved");
        onSaved?.();
        onClose();
        return;
      }
      const r = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: { name, description, visibility } });
      toast("Project created");
      onClose();
      router.push(`/projects/${r.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project");
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
      aria-label={project ? "Edit project" : "New project"}
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold">{project ? "Edit project" : "New project"}</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} placeholder="e.g. Riverside Court" className={inputCls} />
          </Field>
          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={cx(inputCls, "resize-y")} />
          </Field>
          <Field label="Visibility">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Visibility">
              {(
                [
                  ["private", "lock", "Private", "Only you"],
                  ["public", "globe", "Public", me.data?.organisation ? `Everyone in ${me.data.organisation}` : "Everyone in your workspace"],
                ] as const
              ).map(([v, icon, label, detail]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === v}
                  onClick={() => setVisibility(v)}
                  className={cx("flex items-start gap-2.5 rounded-xl border p-3 text-left", visibility === v ? "border-line-strong bg-subtle" : "border-line-strong hover:bg-hover")}
                >
                  <span aria-hidden className={cx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", visibility === v ? "border-ink" : "border-line-strong")}>
                    {visibility === v && <span className="h-2 w-2 rounded-full bg-ink" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                      <Icon name={icon} size={14} className="text-muted" /> {label}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void create()}>
            {busy ? "Saving…" : project ? "Save" : "Create project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
