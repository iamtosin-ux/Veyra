"use client";

import { useState } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import type { EvidenceItem } from "./case/types";
import { Icon } from "./Icon";
import { Button, ErrorNote, Field, cx, inputCls } from "./ui";

interface Consent {
  id: string;
  subject_name: string;
  subject_contact: string | null;
  purpose: string;
  method: "written" | "electronic" | "verbal";
  evidence_ids: string[];
  given_at: string;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
}

/** Consent covering one evidence item, and its withdrawal. Never assumed from an upload. */
export function ConsentRecords({ caseId, item, onChanged }: { caseId: string; item: EvidenceItem; onChanged: () => void }) {
  const data = useApi<{ consents: Consent[] }>(`/api/cases/${caseId}/consents`);
  const [adding, setAdding] = useState(false);
  const [withdrawing, setWithdrawing] = useState<{ id: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = (data.data?.consents ?? []).filter((c) => !c.evidence_ids.length || c.evidence_ids.includes(item.id));

  const withdraw = async () => {
    if (!withdrawing) return;
    setError(null);
    try {
      const r = await api<{ affected: number; flagged: number }>(`/api/consents/${withdrawing.id}/withdraw`, { method: "POST", json: { reason: withdrawing.reason } });
      toast(`Consent withdrawn · ${r.affected} file${r.affected === 1 ? "" : "s"} affected${r.flagged ? `, ${r.flagged} finding${r.flagged === 1 ? "" : "s"} to reassess` : ""}`, { tone: "danger" });
      setWithdrawing(null);
      await data.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the withdrawal");
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted">Consent</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
          <Icon name="plus" size={13} /> Record
        </button>
      </div>
      {list.length === 0 && data.data && <p className="mt-1.5 text-[12px] text-faint">None recorded.</p>}
      <ul className="mt-2 space-y-3">
        {list.map((c) => (
          <li key={c.id} className="text-[12px]">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className={cx("truncate font-medium", c.withdrawn_at && "text-faint")}>{c.subject_name}</p>
                <p className="text-muted">{c.purpose}</p>
                <p className="text-faint">
                  {c.method[0].toUpperCase() + c.method.slice(1)} · {formatDateTime(c.given_at)} · {c.evidence_ids.length ? `${c.evidence_ids.length} file${c.evidence_ids.length === 1 ? "" : "s"}` : "Whole folder"}
                </p>
                {c.withdrawn_at && (
                  <p className="text-danger">
                    Withdrawn {formatDateTime(c.withdrawn_at)}
                    {c.withdrawn_reason ? `: ${c.withdrawn_reason}` : ""}
                  </p>
                )}
              </div>
              {!c.withdrawn_at && (
                <button onClick={() => setWithdrawing({ id: c.id, reason: "" })} className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-danger">
                  Withdraw
                </button>
              )}
            </div>
            {withdrawing?.id === c.id && (
              <div className="mt-2 space-y-2">
                <input autoFocus value={withdrawing.reason} onChange={(e) => setWithdrawing({ ...withdrawing, reason: e.target.value })} placeholder="Reason (optional)" className={cx(inputCls, "text-[12px]")} />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setWithdrawing(null)} className="h-7 rounded-lg px-2.5 text-[12px] hover:bg-hover">Cancel</button>
                  <button onClick={() => void withdraw()} className="h-7 rounded-lg bg-danger px-2.5 text-[12px] font-medium text-white">Record withdrawal</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
      {adding && (
        <RecordConsent
          caseId={caseId}
          evidence={[item]}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void data.reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function RecordConsent({ caseId, evidence, onClose, onSaved }: { caseId: string; evidence: EvidenceItem[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ subject_name: "", subject_contact: "", purpose: "", method: "written" as Consent["method"], given_at: new Date().toISOString().slice(0, 10) });
  const [scope, setScope] = useState<"all" | "some">("some");
  const [picked] = useState<Set<string>>(new Set(evidence.map((e) => e.id)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}/consents`, {
        method: "POST",
        json: { ...form, subject_contact: form.subject_contact || null, given_at: new Date(form.given_at).toISOString(), evidence_ids: scope === "some" ? [...picked] : [] },
      });
      toast("Consent recorded");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record consent");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()} role="dialog" aria-modal="true" aria-label="Record consent">
      <div className="w-full max-w-[480px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold">Record consent</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Given by">
              <input autoFocus value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Contact (optional)">
              <input value={form.subject_contact} onChange={(e) => setForm({ ...form, subject_contact: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Purpose consented to">
            <textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="How">
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Consent["method"] })} className={inputCls}>
                <option value="written">Written</option>
                <option value="electronic">Electronic</option>
                <option value="verbal">Verbal</option>
              </select>
            </Field>
            <Field label="Date given">
              <input type="date" value={form.given_at} onChange={(e) => setForm({ ...form, given_at: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Covers">
            <div className="flex gap-4 text-[13px]">
              <label className="flex items-center gap-1.5"><input type="radio" checked={scope === "some"} onChange={() => setScope("some")} /> This file</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Whole folder</label>
            </div>
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !form.subject_name.trim() || !form.purpose.trim() || (scope === "some" && !picked.size)} onClick={() => void save()}>
            {busy ? "Saving…" : "Record consent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
