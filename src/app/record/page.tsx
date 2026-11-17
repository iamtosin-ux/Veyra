"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { api, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { AppShell, Crumb } from "@/components/AppShell";
import { LevelDots, LiveWaveform } from "@/components/AudioVisuals";
import { Icon } from "@/components/Icon";
import { SOURCE_LABEL, type Recording } from "@/components/RecordingsList";
import { useVoiceRecorder } from "@/components/VoiceRecorder";
import { useLiveTranscript } from "@/components/LiveTranscript";
import { cx } from "@/components/ui";

interface Workflow {
  id: string;
  name: string;
  description: string;
  kind: "analyse" | "review" | "custom";
  is_default: boolean;
}

/** A line in the recording chat: what was said (live transcript) or a note typed meanwhile. */
interface Note {
  kind: "speech" | "note";
  at: string;
  text: string;
}

// Where a recording can come from. Meeting apps need connecting first.
const SOURCES: { id: Recording["source"]; detail: string; logo?: string }[] = [
  { id: "in_person", detail: "This device's microphone" },
  { id: "teams", detail: "Not connected", logo: "microsoft-teams.png" },
  { id: "zoom", detail: "Not connected", logo: "zoom.svg" },
  { id: "meet", detail: "Not connected", logo: "google-meet.svg" },
];

const pill = "rounded-full border border-border-button-default bg-background-primary-default shadow-lg";

/**
 * Record a conversation for a potential case. The sheet opens first to confirm
 * where it's recorded from; once started, it shows the live level, with
 * a live transcript made on this device where the browser offers it; notes typed
 * meanwhile are stamped with the time into the recording. Stopping saves the audio
 * to Recordings, starts a case from it, posts the transcript and notes to the case
 * chat, and runs the chosen workflow (the default analysis unless "/" picked another).
 */
export default function RecordPage() {
  const router = useRouter();
  const workflows = useApi<{ workflows: Workflow[] }>("/api/workflows");
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  // Open on arrival: the source is confirmed before anything is recorded.
  const [details, setDetails] = useState(true);
  const [picked, setPicked] = useState<Workflow | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Stop ends the recording for good, so it pauses first and asks.
  const [ending, setEnding] = useState(false);
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  });

  const all = workflows.data?.workflows ?? [];
  const runAfter = picked ?? all.find((w) => w.kind === "analyse" && w.is_default) ?? null;
  const runAfterRef = useRef(runAfter);
  useEffect(() => {
    runAfterRef.current = runAfter;
  });

  const finish = async (file: File) => {
    try {
      setSaving("Saving the recording…");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "in_person");
      const r = await fetch("/api/recordings", { method: "POST", body: fd });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Could not save the recording");
      setSaving("Starting the case…");
      const { caseId, evidenceId } = await api<{ caseId: string; evidenceId: string }>(`/api/recordings/${b.id}`, { method: "POST", json: { action: "case" } });
      const written = notesRef.current.map((n) => `${n.at}  ${n.kind === "note" ? `Note: ${n.text}` : n.text}`).join("\n");
      await api(`/api/cases/${caseId}/messages`, { method: "POST", json: { text: written ? `From the recording:\n${written}` : "", attachments: [evidenceId] } });
      const w = runAfterRef.current;
      if (w) await api(`/api/workflows/${w.id}/run`, { method: "POST", json: { caseId, prompt: "" } });
      router.push(`/cases/${caseId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the recording", { tone: "danger" });
      setSaving(null);
    }
  };
  const rec = useVoiceRecorder((f) => void finish(f));
  const live = useLiveTranscript(rec.recording && !rec.paused, (text) => setNotes((n) => [...n, { kind: "speech", at: rec.clock, text }]));

  const slash = text.startsWith("/");
  const q = text.slice(1).trim().toLowerCase();
  const matches = slash ? all.filter((w) => w.name.toLowerCase().includes(q)) : [];
  const addNote = () => {
    const t = text.trim();
    if (!t || slash) return;
    setNotes((n) => [...n, { kind: "note", at: rec.clock, text: t }]);
    setText("");
  };
  const pick = (w: Workflow) => {
    setPicked(w);
    setText("");
  };

  return (
    <AppShell
      breadcrumb={
        <>
          <Crumb href="/">Home</Crumb>
          <Crumb current>Recording</Crumb>
        </>
      }
      actions={<span className="tabular-nums text-[13px] text-muted">{rec.clock}</span>}
    >
      <div className="flex h-full flex-col">
        <div className="scroll-panel min-h-0 flex-1">
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-end gap-4 px-6 pb-4 pt-10">
            {notes.map((n, i) =>
              n.kind === "note" ? (
                <div key={i} className="flex flex-col items-end gap-1">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-subtle px-4 py-2.5 text-[14px] leading-relaxed">{n.text}</div>
                  <span className="tabular-nums text-[11px] text-faint">{n.at}</span>
                </div>
              ) : (
                <p key={i} className="flex gap-4 text-[14px] leading-relaxed text-ink">
                  <span className="w-9 shrink-0 pt-px tabular-nums text-[12px] text-faint">{n.at}</span>
                  <span className="min-w-0">{n.text}</span>
                </p>
              ),
            )}
            {/* What is being said right now, until the recogniser settles on it */}
            {live.state === "listening" && rec.recording && !rec.paused && (
              <p className="flex gap-4 text-[14px] leading-relaxed">
                <span className="w-9 shrink-0 pt-px tabular-nums text-[12px] text-faint">{rec.clock}</span>
                {live.interim ? <span className="min-w-0 text-faint">{live.interim}</span> : <span className="shimmer-text">Listening</span>}
              </p>
            )}
            {saving && <p className="shimmer-text text-[14px]">{saving}</p>}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[760px] px-3 pb-3 sm:px-6 sm:pb-5">
          {details && (
            <div className="mb-3 rounded-3xl border border-border-button-default bg-background-primary-default p-4 shadow-lg">
              {rec.recording || saving ? (
                // Recording: the live level and time. The source is settled.
                <div className="flex flex-col items-center justify-center gap-2 rounded-[max(4px,calc(var(--radius-3xl)-1rem))] bg-subtle px-4 py-6">
                  <LiveWaveform analyser={rec.analyser} bars={48} className="h-12 w-full max-w-[320px] text-ink" />
                  <span className="tabular-nums text-[13px] text-muted">{saving ?? (rec.paused ? `Paused · ${rec.clock}` : rec.clock)}</span>
                  {live.state === "preparing" && <span className="text-[12px] text-faint">Preparing live transcript</span>}
                  {live.state === "unavailable" && <span className="text-center text-[12px] text-faint">Live transcript isn&apos;t available in this browser</span>}
                  {ending && (
                    <div className="mt-2 flex flex-col items-center gap-3" role="alertdialog" aria-label="End the recording">
                      <p className="text-center text-[14px] text-ink">End the recording? You can&apos;t resume it after this.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEnding(false);
                            rec.resume();
                          }}
                          className="h-9 rounded-full px-4 text-[13px] font-medium text-ink hover:bg-hover"
                        >
                          Keep recording
                        </button>
                        <button
                          autoFocus
                          onClick={() => {
                            setEnding(false);
                            rec.stop(true);
                          }}
                          className="h-9 rounded-full bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover"
                        >
                          End recording
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Before recording: confirm the source, then start.
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex flex-col items-center justify-center gap-4 rounded-[max(4px,calc(var(--radius-3xl)-1rem))] bg-subtle p-6">
                    <LiveWaveform analyser={null} bars={40} className="h-8 w-full max-w-[240px] text-faint" />
                    <button onClick={() => void rec.start()} className="flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-white hover:bg-primary-hover">
                      <Icon name="mic" size={16} /> Start recording
                    </button>
                  </div>
                  <ul className="space-y-0.5" aria-label="Record from">
                    {SOURCES.map((s) => (
                      <li key={s.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-panel text-muted shadow-[var(--shadow-card)]">
                          {s.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/logos/${s.logo}`} alt="" className="h-4 w-4 object-contain" />
                          ) : (
                            <Icon name="mic" size={16} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{SOURCE_LABEL[s.id]}</span>
                          <span className="block truncate text-[12px] text-muted">{s.detail}</span>
                        </span>
                        {s.id === "in_person" ? (
                          <Icon name="check" size={16} className="text-ink" />
                        ) : (
                          <Link href="/settings?tab=connections" className="rounded-full px-2.5 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
                            Connect
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* On a phone the recorder sits above a full-width note field, so neither is squeezed. */}
          <div className="flex items-center gap-3 max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-2">
            {/* Notes, or "/" to choose the workflow that runs afterwards */}
            <div className={cx(pill, "relative flex h-14 min-w-0 flex-1 items-center gap-2 px-6 max-sm:flex-none max-sm:px-5")}>
              {slash && (
                <ul className="absolute inset-x-0 bottom-full mb-2 max-h-[280px] overflow-auto rounded-2xl border border-border-button-default bg-background-primary-default p-1.5 shadow-lg" aria-label="Workflows">
                  {matches.map((w) => (
                    <li key={w.id}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(w)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-subtle"
                      >
                        <Icon name="workflow" size={16} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px]">{w.name}</span>
                          <span className="block truncate text-[12px] text-muted">{w.description}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matching workflows</li>}
                </ul>
              )}
              {picked && (
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium">
                  <Icon name="workflow" size={12} /> {picked.name}
                  <button onClick={() => setPicked(null)} aria-label={`Remove ${picked.name}`} className="text-faint hover:text-ink">
                    ×
                  </button>
                </span>
              )}
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (slash && matches[0]) pick(matches[0]);
                    else addNote();
                  }
                  if (e.key === "Escape" && slash) setText("");
                }}
                disabled={!!saving}
                placeholder={rec.recording ? "Add a note, or / for a workflow" : "Add a note"}
                aria-label="Add a note"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            {/* Recording: live level, details, pause or resume, stop */}
            <div className={cx(pill, "flex h-14 shrink-0 items-center gap-1 pl-5 pr-2 max-sm:self-center")}>
              <LevelDots analyser={rec.analyser} className={rec.recording && !rec.paused ? "text-notification-success-foreground" : "text-faint"} />
              <button
                onClick={() => setDetails((d) => !d)}
                aria-label={details ? "Hide recording details" : "Show recording details"}
                aria-expanded={details}
                className="ml-1 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink"
              >
                {details ? <RiArrowDownSLine size={16} aria-hidden /> : <RiArrowUpSLine size={16} aria-hidden />}
              </button>
              {rec.recording ? (
                <>
                  <button
                    onClick={() => (rec.paused ? rec.resume() : rec.pause())}
                    disabled={ending}
                    aria-label={rec.paused ? "Resume recording" : "Pause recording"}
                    className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-40"
                  >
                    <Icon name={rec.paused ? "play" : "pauseFill"} size={16} />
                  </button>
                  <button
                    onClick={() => {
                      rec.pause();
                      setEnding(true);
                      setDetails(true);
                    }}
                    disabled={ending}
                    aria-label="Stop recording"
                    className="grid h-10 w-10 place-items-center rounded-full hover:bg-hover disabled:opacity-40"
                  >
                    <span className="h-4 w-4 rounded-[4px] bg-muted" />
                  </button>
                </>
              ) : (
                <button onClick={() => void rec.start()} disabled={!!saving} aria-label="Start recording" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-40">
                  <Icon name="mic" size={16} />
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
