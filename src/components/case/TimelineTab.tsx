"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Empty, ErrorNote, cx, inputCls } from "../ui";
import { Icon } from "../Icon";
import { activityKind, kindsFor } from "@/lib/activities";
import type { ChronoEvent, ChronoSourceClick } from "../ChronologyChart";
import { ChronologyCards, ChronologyGantt, type Reorder } from "../ChronologyViews";

/** The case chronology: dated cards in the side panel, a Gantt-style grid when expanded. */
export function TimelineTab({ caseId, industry, expanded, onSource }: { caseId: string; industry?: string | null; expanded?: boolean; names?: Map<string, string>; onSource: (s: ChronoSourceClick) => void }) {
  const [adding, setAdding] = useState(false);
  const { data, error, reload } = useApi<{ events: ChronoEvent[] }>(`/api/cases/${caseId}/timeline`);
  const events = (data?.events ?? []).filter((e) => e.review_status !== "rejected");
  const rejected = (data?.events ?? []).filter((e) => e.review_status === "rejected");

  const review = async (id: string, status: "accepted" | "rejected" | "unreviewed") => {
    await api(`/api/chronology/${id}/review`, { method: "POST", json: { status } });
    toast(status === "accepted" ? "Event accepted" : status === "rejected" ? "Event rejected" : "Review undone", { tone: status === "rejected" ? "danger" : "default" });
    void reload();
  };

  const reorder: Reorder = async (ids, confirm) => {
    const r = await api<Awaited<ReturnType<Reorder>>>(`/api/cases/${caseId}/timeline`, { method: "POST", json: { order: ids, confirm } });
    if (r.saved) await reload();
    return r;
  };

  const removeActivity = async (id: string) => {
    await api(`/api/cases/${caseId}/activities/${id}`, { method: "DELETE" });
    toast("Activity removed", { tone: "danger" });
    await reload();
  };

  if (error) return <div className="p-4"><ErrorNote>{error}</ErrorNote></div>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-2">
        {adding ? (
          <AddActivity caseId={caseId} industry={industry ?? null} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void reload(); }} />
        ) : (
          <button onClick={() => setAdding(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted hover:bg-hover hover:text-ink">
            <Icon name="plus" size={14} /> Add activity
          </button>
        )}
      </div>
      {data && events.length === 0 && rejected.length === 0 && !adding && <Empty title="No chronology yet">Run the cross-evidence comparison, or add case activity such as a filing or a visit.</Empty>}
      {/* The expanded grid starts under a divider, like the canvas below its header. */}
      <div className={cx("min-h-0 flex-1", expanded && "border-t border-line")}>
        {expanded ? (
          <ChronologyGantt events={events} onSource={onSource} />
        ) : (
          <div className="scroll-panel h-full">
            <ChronologyCards events={events} onSource={onSource} onReorder={reorder} onRemoveActivity={(id) => void removeActivity(id)} />
          </div>
        )}
      </div>
      {rejected.length > 0 && (
        <details className="shrink-0 px-5 py-3 text-[12.5px] text-muted">
          <summary className="cursor-pointer">{rejected.length} rejected event{rejected.length === 1 ? "" : "s"}</summary>
          <ul className="mt-2 space-y-1.5">
            {rejected.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate line-through">{e.description}</span>
                <button onClick={() => void review(e.id, "unreviewed")} className="shrink-0 rounded-lg px-1.5 py-0.5 text-[12px] text-ink hover:bg-hover">Restore</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Record something that happened in the case: a filing, a hearing, a police visit. */
function AddActivity({ caseId, industry, onClose, onAdded }: { caseId: string; industry: string | null; onClose: () => void; onAdded: () => void }) {
  const kinds = kindsFor(industry);
  const [kind, setKind] = useState(kinds[0]?.key ?? "other");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/cases/${caseId}/activities`, { method: "POST", json: { kind, title: title || null, details: details || null, occurred_at: date ? (time ? `${date}T${time}` : date) : null } });
      toast("Activity added to the chronology");
      onAdded();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the activity", { tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-2 rounded-xl bg-subtle p-3"
    >
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of activity" className={inputCls}>
        {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
      </select>
      <div className="flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" disabled={!date} className={inputCls} />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={activityKind(kind)?.label ?? "Title"} aria-label="Title" className={inputCls} />
      <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" aria-label="Details" className={inputCls} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-8 rounded-lg px-3 text-[13px] font-medium hover:bg-hover">Cancel</button>
        <button type="submit" disabled={busy} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
