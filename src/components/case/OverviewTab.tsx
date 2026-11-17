"use client";

import { useState } from "react";
import { api, formatDateTime } from "@/lib/client";
import { Button, CaseStatusChip, ErrorNote, Field, inputCls, useDraftLabel } from "../ui";
import type { CaseData } from "./types";

export function OverviewTab({ data, reload, go }: { data: CaseData; reload: () => void; go: (t: "evidence" | "analysis" | "findings") => void }) {
  const c = data.case;
  const draftLabel = useDraftLabel();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState(c.description);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processed = data.evidence.filter((e) => e.processing_status === "processed").length;
  const nextStep =
    c.evidence_count === 0
      ? { text: "Add evidence to this case.", tab: "evidence" as const, cta: "Add evidence" }
      : processed < c.evidence_count
        ? { text: `${c.evidence_count - processed} evidence item(s) have not been analysed.`, tab: "analysis" as const, cta: "Go to analysis" }
        : !data.latestCaseRun || data.latestCaseRun.status === "failed"
          ? { text: "All evidence is analysed. Compare evidence across sources to generate findings.", tab: "analysis" as const, cta: "Compare evidence" }
          : c.findings_needing_review > 0
            ? { text: `${c.findings_needing_review} finding(s) are ${draftLabel.toLowerCase()}s awaiting your review.`, tab: "findings" as const, cta: "Review findings" }
            : null;

  return (
    <div className="scroll-panel h-full">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {nextStep && (
          <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent-soft px-4 py-3">
            <p className="text-sm text-accent">{nextStep.text}</p>
            <Button variant="primary" size="sm" onClick={() => go(nextStep.tab)}>{nextStep.cta}</Button>
          </div>
        )}

        <section className="rounded-lg border border-line bg-panel p-6">
          {editing ? (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(`/api/cases/${c.id}`, { method: "PATCH", json: { title, description } });
                  setEditing(false);
                  reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Save failed");
                }
              }}
            >
              <Field label="Case name"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
              <Field label="Description"><textarea className={inputCls} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              <div className="flex gap-2"><Button variant="primary">Save</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
            </form>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="tabular-nums text-xs text-faint">{c.reference}</p>
                  <h2 className="mt-1 font-display text-2xl">{c.title}</h2>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setTitle(c.title); setDescription(c.description); setEditing(true); }}>Edit</Button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{c.description || <span className="text-faint">No description.</span>}</p>
            </>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-4 pt-5 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Status</dt><dd className="mt-1"><CaseStatusChip status={c.status} /></dd></div>
            <div><dt className="text-xs text-muted">Created</dt><dd className="mt-1">{formatDateTime(c.created_at)}</dd></div>
            <div><dt className="text-xs text-muted">Last updated</dt><dd className="mt-1">{formatDateTime(c.updated_at)}</dd></div>
            <div><dt className="text-xs text-muted">Evidence items</dt><dd className="mt-1 font-display text-xl">{c.evidence_count}</dd></div>
            <div><dt className="text-xs text-muted">Findings</dt><dd className="mt-1 font-display text-xl">{c.findings_count}</dd></div>
          </dl>
        </section>

        <section className="rounded-lg border border-danger/20 bg-panel p-6">
          <h3 className="font-medium text-danger">Delete case</h3>
          <p className="mt-1 text-sm text-muted">
            Permanently deletes this case, its stored original files, all observations, findings, review history and case packs. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label={`Type ${c.reference} to confirm`}>
              <input className={inputCls + " w-56 tabular-nums"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button
              variant="danger"
              disabled={confirm !== c.reference || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await api(`/api/cases/${c.id}`, { method: "DELETE", json: { confirmReference: confirm } });
                  window.location.href = "/";
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Delete failed");
                  setDeleting(false);
                }
              }}
            >
              Delete permanently
            </Button>
          </div>
        </section>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </div>
  );
}
