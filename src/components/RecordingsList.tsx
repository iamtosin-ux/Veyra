"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { cx } from "./ui";

export interface Recording {
  id: string;
  title: string;
  source: "in_person" | "teams" | "zoom" | "meet";
  recorded_at: string;
  status: string;
  case: { id: string; title: string } | null;
  dismissed: boolean;
}

export const SOURCE_LABEL: Record<Recording["source"], string> = {
  in_person: "In person",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  meet: "Google Meet",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
/** Pure: "22:28" today, "1 Nov, 22:28" on another day. */
export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString() ? time(iso) : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time(iso)}`;
}

/**
 * Recordings made before there is a case, newest first. Each one not yet in a
 * case offers to start one: the recording becomes its first evidence, the chat
 * picks it up with its transcript, and analysis starts building the canvas.
 * Hovering a row shows its checkbox and actions; ticking several starts one
 * case from all of them.
 */
export function RecordingsList({
  recordings,
  highlight,
  folderId,
  analyseWorkflowId,
  onChanged,
}: {
  recordings: Recording[];
  highlight: string | null;
  folderId: string | null;
  analyseWorkflowId: string | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const vault = useApi<{ folders: { id: string; title: string; archived: boolean }[] }>("/api/vault");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const selecting = picked.size > 0;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // The new case gets the recordings in its chat (for their transcripts) and the default analysis.
  const openCase = async (caseId: string, evidenceIds: string[]) => {
    await api(`/api/cases/${caseId}/messages`, { method: "POST", json: { text: "", attachments: evidenceIds } });
    if (analyseWorkflowId) await api(`/api/workflows/${analyseWorkflowId}/run`, { method: "POST", json: { caseId, prompt: "" } });
    router.push(`/cases/${caseId}`);
  };
  const run = async (fn: () => Promise<unknown>, failed: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : failed, { tone: "danger" });
    }
    setBusy(false);
  };
  const startOne = (r: Recording) =>
    run(async () => {
      const { caseId, evidenceId } = await api<{ caseId: string; evidenceId: string }>(`/api/recordings/${r.id}`, { method: "POST", json: { action: "case" } });
      await openCase(caseId, [evidenceId]);
    }, "Could not start the case");
  const startPicked = () =>
    run(async () => {
      const { caseId, evidenceIds } = await api<{ caseId: string; evidenceIds: string[] }>("/api/recordings", { method: "PUT", json: { ids: [...picked] } });
      await openCase(caseId, evidenceIds);
    }, "Could not start the case");
  const dismiss = (r: Recording) => run(async () => { await api(`/api/recordings/${r.id}`, { method: "POST", json: { action: "dismiss" } }); onChanged(); }, "Could not update");
  const rename = () => {
    const e = editing;
    setEditing(null);
    if (!e || !e.title.trim()) return;
    void run(async () => { await api(`/api/evidence/${e.id}`, { method: "PATCH", json: { display_name: e.title.trim() } }); onChanged(); }, "Could not rename");
  };
  const remove = (ids: string[]) =>
    run(async () => {
      for (const id of ids) await api(`/api/evidence/${id}`, { method: "DELETE" });
      setPicked(new Set());
      setDeleting(null);
      toast(ids.length === 1 ? "Recording deleted" : `${ids.length} recordings deleted`, { tone: "danger" });
      onChanged();
    }, "Could not delete");
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/vault/${folderId ?? ""}`);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link", { tone: "danger" });
    }
  };
  const copyTo = (r: Recording, folder: { id: string; title: string }) =>
    run(async () => {
      await api(`/api/recordings/${r.id}`, { method: "POST", json: { action: "copy", folderId: folder.id } });
      toast(`Added to ${folder.title.replace(/^DEMO · /, "")}`);
    }, "Could not add to the vault");

  const folders = (vault.data?.folders ?? []).filter((f) => !f.archived && f.id !== folderId);
  const menu = (r: Recording): MenuItem[] => [
    { label: "Edit", icon: "pencil", onSelect: () => setEditing({ id: r.id, title: r.title }) },
    { label: "Share", icon: "link", onSelect: () => void share() },
    {
      label: "Add to vault",
      icon: "vault",
      onSelect: () => {},
      items: folders.length
        ? folders.slice(0, 12).map((f) => ({ label: f.title.replace(/^DEMO · /, ""), icon: "folder" as const, onSelect: () => void copyTo(r, f) }))
        : [{ label: "No other folders", disabled: true, onSelect: () => {} }],
    },
    { kind: "separator" },
    { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(r.id) },
  ];

  return (
    <div>
      {selecting && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-subtle px-3 py-1.5 text-[13px]">
          <span className="text-muted">{picked.size} selected</span>
          <button onClick={() => void startPicked()} disabled={busy} className="ml-auto h-7 rounded-lg bg-primary px-3 text-[12px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            Start a case
          </button>
          <button onClick={() => void remove([...picked])} disabled={busy} className="h-7 rounded-lg px-3 text-[12px] font-medium text-danger hover:bg-danger-soft">
            Delete
          </button>
          <button onClick={() => setPicked(new Set())} aria-label="Clear selection" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <ul className="-mx-2">
        {recordings.map((r) => {
          const on = picked.has(r.id);
          return (
            <li key={r.id} className={cx("group flex items-center gap-3 rounded-lg px-2 py-2", on ? "bg-subtle" : "hover:bg-subtle")}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(r.id)}
                aria-label={`Select ${r.title}`}
                className={cx("h-4 w-4 shrink-0 accent-[var(--color-primary)]", selecting || on ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
              />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-subtle text-muted group-hover:bg-hover">
                <Icon name={r.source === "in_person" ? "mic" : "video"} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                {editing?.id === r.id ? (
                  <input
                    autoFocus
                    value={editing.title}
                    onChange={(e) => setEditing({ id: r.id, title: e.target.value })}
                    onBlur={rename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    aria-label="Recording name"
                    className="w-full rounded-md bg-panel px-1.5 py-0.5 text-[14px] outline-none ring-1 ring-line-strong"
                  />
                ) : (
                  <span className="block truncate text-[14px]">{r.title}</span>
                )}
                <span className="block truncate text-[12px] text-muted">
                  Me · {SOURCE_LABEL[r.source]}
                  {r.status === "processing" || r.status === "queued" ? " · Transcribing" : ""}
                </span>
              </span>

              {/* Confirming a delete takes the place of everything on the right */}
              {deleting === r.id ? (
                <span className="flex shrink-0 items-center gap-1 text-[13px]">
                  <span className="pr-1 text-muted">Delete this recording?</span>
                  <button onClick={() => void remove([r.id])} disabled={busy} className="h-7 rounded-lg bg-danger px-2.5 text-[12px] font-medium text-white disabled:opacity-50">
                    Delete
                  </button>
                  <button onClick={() => setDeleting(null)} className="h-7 rounded-lg px-2.5 text-[12px] font-medium hover:bg-hover">
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  {r.case ? (
                    <Link href={`/cases/${r.case.id}`} className="flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg bg-panel px-3 text-[13px] ring-1 ring-line hover:ring-line-strong">
                      <Icon name="folder" size={14} className="shrink-0 text-muted" />
                      <span className="truncate">{r.case.title}</span>
                    </Link>
                  ) : (
                    <span
                      className={cx(
                        "h-8 shrink-0 items-center gap-0.5 rounded-full bg-panel pl-3 pr-1 text-[13px] ring-1",
                        r.id === highlight ? "flex ring-line-strong shadow-[var(--shadow-card)]" : "ring-line",
                        // A dismissed suggestion comes back on hover, so the case can still be started.
                        r.dismissed && r.id !== highlight ? "hidden group-hover:flex" : "flex",
                      )}
                    >
                      <span className="pr-1.5 text-ink">Start a case</span>
                      <button onClick={() => void startOne(r)} disabled={busy} aria-label={`Start a case from ${r.title}`} className="grid h-6 w-6 place-items-center rounded-lg text-ok hover:bg-hover disabled:opacity-50">
                        <Icon name="check" size={15} />
                      </button>
                      {!r.dismissed && (
                        <button onClick={() => void dismiss(r)} aria-label="Not now" className="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </span>
                  )}

                  <span className="w-[86px] shrink-0 text-right text-[12px] tabular-nums text-muted">{when(r.recorded_at)}</span>
                  <Menu
                    align="right"
                    width={190}
                    items={menu(r)}
                    trigger={({ toggle: t, ref, open }) => (
                      <button
                        ref={ref}
                        onClick={t}
                        aria-label={`Actions for ${r.title}`}
                        aria-expanded={open}
                        className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink", open ? "bg-hover text-ink opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                      >
                        <Icon name="moreH" size={16} />
                      </button>
                    )}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
