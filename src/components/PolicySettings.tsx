"use client";

import { useState, type ReactNode } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { CATEGORIES, CATEGORY_LABEL, LAWFUL_BASES, LAWFUL_BASIS_LABEL, OPERATIONS, OPERATION_LABEL, PROVIDERS, PROVIDER_LABEL, type PolicyConfig } from "@/lib/compliance";
import { MOCK_APPROVED_POLICY, MOCK_RESTRICTED_POLICY } from "@/lib/mockPolicies";
import { Icon } from "./Icon";
import { Button, ErrorNote, Field, cx, inputCls } from "./ui";

interface PolicyResponse {
  policy: { id: string; version: number; config: PolicyConfig; approver_name: string; approved_at: string } | null;
  history: { id: string; version: number; status: string; approver_name: string; approved_at: string }[];
  canApprove: boolean;
}

const EMPTY: PolicyConfig = {
  label: "",
  controller: "",
  veyra_role: "processor",
  processing_instructions: "",
  purpose: "",
  lawful_basis: "",
  special_category_condition: "",
  criminal_offence_condition: "",
  schedule1_conditions: "",
  appropriate_policy_document: false,
  categories: ["general"],
  operations: [],
  providers: [],
  transfer_arrangements: "",
  retention_days: 365,
  roles: ["admin"],
  external_verification: false,
  verification_providers: [],
  dpia_required: true,
  dpia_status: "not_started",
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 pt-5">
      <legend className="-mt-2 pr-2 text-[13px] font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function Checks<T extends string>({ all, labels, value, onChange, disabled }: { all: readonly T[]; labels: Record<T, string>; value: T[]; onChange: (v: T[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {all.map((k) => (
        <label key={k} className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" disabled={disabled} checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
          {labels[k]}
        </label>
      ))}
    </div>
  );
}

/**
 * The organisation's processing policy. Veyra enforces what it records; it
 * doesn't choose a lawful basis or judge whether the policy is legally sufficient.
 */
export function PolicySettings() {
  const data = useApi<PolicyResponse>("/api/compliance/policy");
  const [draft, setDraft] = useState<PolicyConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = data.data?.policy;
  const form = draft ?? current?.config ?? EMPTY;
  const can = !!data.data?.canApprove;
  const set = (patch: Partial<PolicyConfig>) => setDraft({ ...form, ...patch });

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ policy: { version: number } }>("/api/compliance/policy", { method: "POST", json: form });
      toast(`Processing policy version ${r.policy.version} approved`);
      setDraft(null);
      await data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve the policy");
    }
    setBusy(false);
  };

  if (!data.data) return null;
  return (
    <div className="max-w-2xl space-y-6">
      <div className={cx("flex items-start gap-3 rounded-xl px-4 py-3", current ? "bg-subtle" : "bg-danger-soft")}>
        <Icon name={current ? "shield" : "alert"} size={18} className={cx("mt-0.5 shrink-0", current ? "text-muted" : "text-ink")} />
        <div className="text-[13px] leading-relaxed">
          {current ? (
            <p>
              <span className="font-medium">Version {current.version}</span> approved by {current.approver_name} on {formatDateTime(current.approved_at)}.
              {current.config.label ? <span className="text-muted"> {current.config.label}.</span> : null}
            </p>
          ) : (
            <p className="font-medium text-danger">No approved policy. Evidence can be uploaded and integrity-checked, but nothing is analysed until a policy is approved.</p>
          )}
          <p className="mt-1 text-muted">Veyra&apos;s checks are safeguards, not legal determinations. Your organisation approves this policy, reviewed by legal or data-protection professionals.</p>
        </div>
      </div>

      {can && (
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <span className="self-center text-muted">For synthetic demo data only:</span>
          <button onClick={() => setDraft(MOCK_APPROVED_POLICY)} className="rounded-lg border border-line px-2.5 py-1 hover:bg-subtle">Load mock approved policy</button>
          <button onClick={() => setDraft(MOCK_RESTRICTED_POLICY)} className="rounded-lg border border-line px-2.5 py-1 hover:bg-subtle">Load mock restricted policy</button>
        </div>
      )}

      <Group title="Controller and role">
        <Field label="Responsible data controller">
          <input disabled={!can} value={form.controller} onChange={(e) => set({ controller: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Veyra's role">
          <select disabled={!can} value={form.veyra_role} onChange={(e) => set({ veyra_role: e.target.value as PolicyConfig["veyra_role"] })} className={inputCls}>
            <option value="processor">Processor</option>
            <option value="controller">Controller</option>
            <option value="joint_controller">Joint controller</option>
          </select>
        </Field>
        {form.veyra_role === "processor" && (
          <Field label="Documented processing instructions">
            <textarea disabled={!can} rows={3} value={form.processing_instructions} onChange={(e) => set({ processing_instructions: e.target.value })} className={inputCls} />
          </Field>
        )}
      </Group>

      <Group title="Purpose and lawful basis">
        <Field label="Purpose of processing">
          <textarea disabled={!can} rows={2} value={form.purpose} onChange={(e) => set({ purpose: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Article 6 lawful basis">
          <select disabled={!can} value={form.lawful_basis} onChange={(e) => set({ lawful_basis: e.target.value as PolicyConfig["lawful_basis"] })} className={inputCls}>
            <option value="">Not set</option>
            {LAWFUL_BASES.map((b) => (
              <option key={b} value={b}>{LAWFUL_BASIS_LABEL[b]}</option>
            ))}
          </select>
        </Field>
      </Group>

      <Group title="Special-category and criminal-offence data">
        <Field label="Article 9 condition">
          <input disabled={!can} value={form.special_category_condition} onChange={(e) => set({ special_category_condition: e.target.value })} placeholder="Leave empty if not processed" className={inputCls} />
        </Field>
        <Field label="DPA 2018 Schedule 1 conditions">
          <input disabled={!can} value={form.schedule1_conditions} onChange={(e) => set({ schedule1_conditions: e.target.value })} placeholder="Leave empty if not processed" className={inputCls} />
        </Field>
        <Field label="Article 10 / criminal-offence data authorisation">
          <input disabled={!can} value={form.criminal_offence_condition} onChange={(e) => set({ criminal_offence_condition: e.target.value })} placeholder="Leave empty if not processed" className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" disabled={!can} checked={form.appropriate_policy_document} onChange={(e) => set({ appropriate_policy_document: e.target.checked })} />
          An appropriate policy document is in place
        </label>
      </Group>

      <Group title="Evidence the policy covers">
        <Checks all={CATEGORIES} labels={CATEGORY_LABEL} value={form.categories} onChange={(v) => set({ categories: v })} disabled={!can} />
      </Group>

      <Group title="Approved operations">
        <Checks all={OPERATIONS.filter((o) => o !== "integrity_check")} labels={OPERATION_LABEL} value={form.operations} onChange={(v) => set({ operations: v })} disabled={!can} />
      </Group>

      <Group title="AI providers and transfers">
        <Checks all={[...PROVIDERS]} labels={PROVIDER_LABEL} value={form.providers} onChange={(v) => set({ providers: v })} disabled={!can} />
        <Field label="Subprocessor and transfer arrangements">
          <textarea disabled={!can} rows={2} value={form.transfer_arrangements} onChange={(e) => set({ transfer_arrangements: e.target.value })} className={inputCls} />
        </Field>
      </Group>

      <Group title="Access, DPIA and retention">
        <div className="flex gap-5 text-[13px]">
          {["admin", "member"].map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="checkbox" disabled={!can} checked={form.roles.includes(r)} onChange={(e) => set({ roles: e.target.checked ? [...form.roles, r] : form.roles.filter((x) => x !== r) })} />
              {r === "admin" ? "Admins" : "Members"} can run processing
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" disabled={!can} checked={form.dpia_required} onChange={(e) => set({ dpia_required: e.target.checked })} />
          A DPIA is required
        </label>
        {form.dpia_required && (
          <Field label="DPIA status">
            <select disabled={!can} value={form.dpia_status} onChange={(e) => set({ dpia_status: e.target.value as PolicyConfig["dpia_status"] })} className={inputCls}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="approved">Approved</option>
            </select>
          </Field>
        )}
        <Field label="Retention (days)">
          <input disabled={!can} type="number" min={1} value={form.retention_days} onChange={(e) => set({ retention_days: Number(e.target.value) || 1 })} className={cx(inputCls, "w-32")} />
        </Field>
      </Group>

      <Group title="External verification">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" disabled={!can} checked={form.external_verification} onChange={(e) => set({ external_verification: e.target.checked })} />
          Permit external verification requests
        </label>
        <p className="text-[12.5px] text-muted">No verification integrations are connected, so requests are refused and recorded.</p>
      </Group>

      {error && <ErrorNote>{error}</ErrorNote>}
      {can ? (
        <div className="flex items-center gap-3 pt-5">
          <Button variant="primary" disabled={busy || (!draft && !!current)} onClick={() => void approve()}>
            {busy ? "Approving…" : `Approve as version ${(current?.version ?? 0) + 1}`}
          </Button>
          {draft && <Button variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>}
        </div>
      ) : (
        <p className="pt-5 text-[13px] text-muted">Only an administrator can change the processing policy.</p>
      )}

      {current && <RetentionReview canManage={can} />}

      {data.data.history.length > 0 && (
        <section className="pt-5">
          <p className="text-[13px] font-medium">Versions</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {data.data.history.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="w-8 font-medium">v{h.version}</span>
                <span className="text-muted">{h.approver_name} · {formatDateTime(h.approved_at)}</span>
                {h.status === "approved" && <span className="rounded-md bg-ok-soft px-1.5 py-px text-[11px] text-ok">Current</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface Retention {
  retention_days: number | null;
  due: { id: string; reference: string; original_filename: string; uploaded_at: string; case_id: string; case_title: string }[];
  holds: { id: string; title: string; legal_hold_reason: string | null }[];
}

/** Items past the retention period. Nothing is deleted until an administrator confirms it. */
function RetentionReview({ canManage }: { canManage: boolean }) {
  const r = useApi<Retention>("/api/compliance/retention");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [holdFor, setHoldFor] = useState<{ id: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const due = r.data?.due ?? [];

  const post = async (json: Record<string, unknown>, done: string, tone?: "danger") => {
    setError(null);
    try {
      await api("/api/compliance/retention", { method: "POST", json });
      toast(done, { tone });
      setPicked(new Set());
      setConfirm(false);
      setHoldFor(null);
      await r.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (!r.data) return null;
  return (
    <section className="space-y-3 pt-5">
      <p className="text-[13px] font-medium">Retention review</p>
      <p className="text-[13px] text-muted">
        {due.length ? `${due.length} item${due.length === 1 ? " is" : "s are"} past the ${r.data.retention_days}-day retention period.` : `Nothing is past the ${r.data.retention_days}-day retention period.`}
      </p>
      {due.length > 0 && (
        <ul className="">
          {due.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              {canManage && (
                <input
                  type="checkbox"
                  aria-label={`Select ${d.original_filename}`}
                  checked={picked.has(d.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    setPicked(next);
                  }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.original_filename}</span>
                <span className="block truncate text-[12px] text-muted">{d.case_title.replace(/^DEMO · /, "")} · uploaded {formatDateTime(d.uploaded_at)}</span>
              </span>
              {canManage && (
                <button onClick={() => setHoldFor({ id: d.case_id, reason: "" })} className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
                  Legal hold
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {holdFor && (
        <div className="flex items-center gap-2">
          <input autoFocus value={holdFor.reason} onChange={(e) => setHoldFor({ ...holdFor, reason: e.target.value })} placeholder="Why this case must be kept" className={inputCls} />
          <Button disabled={!holdFor.reason.trim()} onClick={() => void post({ action: "hold", caseId: holdFor.id, hold: true, reason: holdFor.reason }, "Case placed on legal hold")}>Place hold</Button>
          <Button variant="ghost" onClick={() => setHoldFor(null)}>Cancel</Button>
        </div>
      )}
      {canManage && picked.size > 0 && (
        <div className="flex items-center gap-2">
          {confirm ? (
            <>
              <span className="text-[13px] text-danger">Permanently delete {picked.size} item{picked.size === 1 ? "" : "s"} and everything derived from them?</span>
              <Button variant="danger" onClick={() => void post({ action: "delete", evidenceIds: [...picked] }, `Deleted ${picked.size} item${picked.size === 1 ? "" : "s"}`, "danger")}>Delete</Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirm(true)}>Delete selected</Button>
          )}
        </div>
      )}
      {r.data.holds.length > 0 && (
        <div>
          <p className="text-[12.5px] text-muted">On legal hold</p>
          <ul className="mt-1.5 space-y-1">
            {r.data.holds.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[13px]">
                <Icon name="lock" size={13} className="text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {h.title.replace(/^DEMO · /, "")}
                  {h.legal_hold_reason ? <span className="text-muted"> · {h.legal_hold_reason}</span> : null}
                </span>
                {canManage && (
                  <button onClick={() => void post({ action: "hold", caseId: h.id, hold: false }, "Legal hold released")} className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
                    Release
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}
