"use client";

import { useState } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon } from "./Icon";
import { Button, Chip, ErrorNote, Field, cx, inputCls } from "./ui";

interface Request {
  id: string;
  kind: "access" | "erasure";
  subject_name: string;
  identifiers: string[];
  status: "open" | "completed" | "refused";
  received_at: string;
  due_at: string;
  notes: string | null;
  outcome: string | null;
}

interface Match {
  kind: "contributor" | "evidence_content" | "observation" | "finding" | "message" | "consent" | "invite";
  id: string;
  label: string;
  snippet: string;
  evidence_id: string | null;
}

interface Detail {
  request: Request;
  cases: { case_id: string; case_title: string; legal_hold: boolean; matches: Match[] }[];
  unsearched: number;
}

const KIND_LABEL: Record<Match["kind"], string> = {
  contributor: "Sent or named as contributor",
  evidence_content: "Mentioned in evidence",
  observation: "Observation",
  finding: "Finding",
  message: "Case conversation",
  consent: "Consent record",
  invite: "Upload invitation",
};

const daysLeft = (due: string) => Math.ceil((Date.parse(due) - Date.now()) / 86_400_000);

/** Access and erasure requests: find what's held about a person, export it, or erase it. */
export function SubjectRequests() {
  const list = useApi<{ requests: Request[] }>("/api/subject-requests");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (list.error) return <p className="text-[13px] text-muted">{list.error}</p>;
  if (open) return <RequestDetail id={open} onBack={() => { setOpen(null); void list.reload(); }} />;
  const requests = list.data?.requests ?? [];
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setCreating(true)}>New request</Button>
      </div>
      {creating && <NewRequest onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {list.data && requests.length === 0 && <p className="text-[13px] text-muted">No requests yet.</p>}
      <ul className="">
        {requests.map((r) => {
          const left = daysLeft(r.due_at);
          return (
            <li key={r.id}>
              <button onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-subtle">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{r.subject_name}</span>
                  <span className="block text-[12px] text-muted">Received {formatDateTime(r.received_at)}</span>
                </span>
                <Chip tone={r.kind === "erasure" ? "danger" : "info"}>{r.kind === "erasure" ? "Erasure" : "Access"}</Chip>
                {r.status === "open" ? (
                  <span className={cx("w-28 shrink-0 text-right text-[12px]", left < 0 ? "text-danger" : left <= 7 ? "text-draft" : "text-muted")}>
                    {left < 0 ? `${-left} days overdue` : `Due in ${left} days`}
                  </span>
                ) : (
                  <span className="w-28 shrink-0 text-right text-[12px] text-faint">{r.status === "completed" ? "Completed" : "Refused"}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewRequest({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ kind: "access" as Request["kind"], subject_name: "", identifiers: "", received_at: new Date().toISOString().slice(0, 10), notes: "" });
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      const r = await api<{ request: Request }>("/api/subject-requests", {
        method: "POST",
        json: { kind: form.kind, subject_name: form.subject_name, identifiers: form.identifiers.split(",").map((s) => s.trim()).filter(Boolean), received_at: new Date(form.received_at).toISOString(), notes: form.notes || null },
      });
      toast("Request logged");
      onCreated(r.request.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log the request");
    }
  };
  return (
    <div className="space-y-3 rounded-2xl bg-subtle p-4">
      <div className="flex gap-4 text-[13px]">
        {(["access", "erasure"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="radio" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} /> {k === "access" ? "Access" : "Erasure"}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Person's name">
          <input autoFocus value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Received">
          <input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <Field label="Other identifiers (optional)">
        <input value={form.identifiers} onChange={(e) => setForm({ ...form, identifiers: e.target.value })} placeholder="Email, phone, other names, separated by commas" className={inputCls} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!form.subject_name.trim()} onClick={() => void save()}>Log request</Button>
      </div>
    </div>
  );
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const d = useApi<Detail>(`/api/subject-requests/${id}`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [closing, setClosing] = useState<{ status: "completed" | "refused"; outcome: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = d.data?.request;
  const erasure = r?.kind === "erasure" && r.status === "open";

  const erase = async () => {
    setError(null);
    try {
      const res = await api<{ deleted: number; redacted: number; skipped: string[] }>(`/api/subject-requests/${id}/erase`, { method: "POST", json: { evidenceIds: [...picked], redact: true } });
      toast(`Erased: ${res.deleted} file${res.deleted === 1 ? "" : "s"} deleted, ${res.redacted} mention${res.redacted === 1 ? "" : "s"} removed${res.skipped.length ? `, ${res.skipped.length} kept under legal hold` : ""}`, { tone: "danger" });
      setConfirm(false);
      setPicked(new Set());
      await d.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erasure failed");
    }
  };
  const close = async () => {
    if (!closing) return;
    setError(null);
    try {
      await api(`/api/subject-requests/${id}`, { method: "PATCH", json: closing });
      toast(closing.status === "completed" ? "Request completed" : "Request refused");
      setClosing(null);
      await d.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close the request");
    }
  };

  if (!d.data || !r) return null;
  const total = d.data.cases.reduce((n, c) => n + c.matches.length, 0);
  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <Icon name="arrowLeft" size={14} /> All requests
      </button>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[16px] font-medium">{r.subject_name}</p>
          <Chip tone={r.kind === "erasure" ? "danger" : "info"}>{r.kind === "erasure" ? "Erasure" : "Access"}</Chip>
          {r.status !== "open" && <Chip>{r.status === "completed" ? "Completed" : "Refused"}</Chip>}
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Received {formatDateTime(r.received_at)} · respond by {formatDateTime(r.due_at)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.identifiers.map((i) => (
            <span key={i} className="rounded-md bg-subtle px-1.5 py-0.5 text-[12px] text-muted">{i}</span>
          ))}
        </div>
        {r.outcome && <p className="mt-2 text-[12.5px] text-muted">Outcome: {r.outcome}</p>}
      </div>

      <section>
        <p className="text-[13px] font-medium">
          Found {total} mention{total === 1 ? "" : "s"} in {d.data.cases.length} case{d.data.cases.length === 1 ? "" : "s"}
        </p>
        {d.data.unsearched > 0 && <p className="mt-0.5 text-[12.5px] text-draft">{d.data.unsearched} file{d.data.unsearched === 1 ? " hasn't" : "s haven't"} been processed, so their contents weren&apos;t searched.</p>}
        <div className="mt-3 space-y-5">
          {d.data.cases.map((c) => (
            <div key={c.case_id}>
              <p className="flex items-center gap-2 text-[13px] font-medium">
                {c.case_title}
                {c.legal_hold && (
                  <span className="flex items-center gap-1 rounded-md bg-subtle px-1.5 py-px text-[11px] font-normal text-muted">
                    <Icon name="lock" size={11} /> Legal hold
                  </span>
                )}
              </p>
              <ul className="mt-1.5 ">
                {c.matches.map((m) => {
                  const deletable = erasure && !c.legal_hold && m.evidence_id && (m.kind === "contributor" || m.kind === "evidence_content");
                  return (
                    <li key={`${m.kind}:${m.id}`} className="flex items-start gap-2.5 py-2 text-[12.5px]">
                      {deletable ? (
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          aria-label={`Delete ${m.label}`}
                          checked={picked.has(m.evidence_id!)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(m.evidence_id!);
                            else next.delete(m.evidence_id!);
                            setPicked(next);
                          }}
                        />
                      ) : (
                        <span className="w-[13px] shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-muted">{KIND_LABEL[m.kind]} · {m.label}</span>
                        <span className="line-clamp-2 block">{m.snippet}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <a href={`/api/subject-requests/${id}/export`} className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-[13px] font-medium hover:bg-subtle">
          <Icon name="download" size={15} /> Download export
        </a>
        {erasure && !confirm && <Button variant="danger" onClick={() => setConfirm(true)}>Erase…</Button>}
        {r.status === "open" && !closing && (
          <>
            <Button variant="ghost" className="ml-auto" onClick={() => setClosing({ status: "completed", outcome: "" })}>Complete</Button>
            <Button variant="ghost" onClick={() => setClosing({ status: "refused", outcome: "" })}>Refuse</Button>
          </>
        )}
      </div>
      <p className="text-[12px] text-faint">Exports can include other people&apos;s information. Check them before sending.</p>

      {confirm && (
        <div className="space-y-2 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <p>
            Delete {picked.size} selected file{picked.size === 1 ? "" : "s"} and replace {r.subject_name}&apos;s identifiers with “[erased]” in observations, findings, conversations and extracted text. Cases on legal hold are skipped. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void erase()}>Erase</Button>
          </div>
        </div>
      )}
      {closing && (
        <div className="space-y-2">
          <input autoFocus value={closing.outcome} onChange={(e) => setClosing({ ...closing, outcome: e.target.value })} placeholder={closing.status === "refused" ? "Why it was refused" : "What was done (optional)"} className={inputCls} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
            <Button variant="primary" disabled={closing.status === "refused" && !closing.outcome.trim()} onClick={() => void close()}>
              {closing.status === "completed" ? "Mark completed" : "Mark refused"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
