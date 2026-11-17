"use client";

import { useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "../Icon";
import { Button, ErrorNote, Field, cx, inputCls } from "../ui";

function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold">{label}</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Edit a case's name and description. */
export function CaseDetailsDialog({ caseId, title, description, onClose, onSaved }: { caseId: string; title: string; description: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}`, { method: "PATCH", json: { title: name.trim(), description: desc } });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Dialog label="Rename case" onClose={onClose}>
      <div className="mt-4 space-y-3">
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} className={cx(inputCls, "resize-y")} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}

interface Person {
  id: string;
  name: string;
  email: string | null;
  you: boolean;
}

const ROLE_LABEL: Record<string, string> = { manager: "Case manager", editor: "Editor", viewer: "Viewer" };

/**
 * Hand the case to a new case manager: anyone in the workspace. Someone not on
 * the case yet joins as a case manager; you stay on as one.
 */
export function TransferOwnershipDialog({ caseId, onClose, onTransferred }: { caseId: string; onClose: () => void; onTransferred: (name: string) => void }) {
  const people = useApi<{ members: Person[] }>("/api/members");
  const access = useApi<{ owner: { id: string } | null; members: { email: string; name: string | null; role: string }[] }>(`/api/cases/${caseId}/members`);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOf = (p: Person) => access.data?.members.find((m) => m.email.toLowerCase() === p.email?.toLowerCase())?.role;
  const t = q.trim().toLowerCase();
  const list = (people.data?.members ?? [])
    .filter((p) => p.id !== access.data?.owner?.id)
    .filter((p) => !t || p.name.toLowerCase().includes(t) || (p.email ?? "").toLowerCase().includes(t));

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}/owner`, { method: "POST", json: { user_id: picked.id } });
      onTransferred(picked.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not transfer the case");
      setBusy(false);
    }
  };

  return (
    <Dialog label="Transfer ownership" onClose={onClose}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className={cx(inputCls, "mt-4")} />
      <ul className="mt-2 max-h-[300px] space-y-0.5 overflow-y-auto" role="radiogroup" aria-label="New owner">
        {list.map((p) => {
          const role = roleOf(p);
          return (
            <li key={p.id}>
              <button
                role="radio"
                aria-checked={picked?.id === p.id}
                onClick={() => setPicked(p)}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", picked?.id === p.id ? "bg-subtle" : "hover:bg-hover")}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d9822b] text-[12px] font-semibold text-white">{p.name.trim()[0]?.toUpperCase() ?? "?"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{p.name}{p.you ? " (you)" : ""}</span>
                  {p.email && <span className="block truncate text-[12px] text-muted">{p.email}</span>}
                </span>
                {role && <span className="shrink-0 text-[12px] text-muted">{ROLE_LABEL[role] ?? role}</span>}
                {picked?.id === p.id && <Icon name="check" size={16} className="shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
      {people.data && list.length === 0 && <p className="mt-2 px-1 text-[13px] text-muted">{t ? "No one matches." : "No one else is in this workspace yet."}</p>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!picked || busy} onClick={() => void save()}>
          {busy ? "Transferring…" : "Transfer ownership"}
        </Button>
      </div>
    </Dialog>
  );
}
