"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { api, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Icon, type IconName } from "@/components/Icon";
import { PolicySettings } from "@/components/PolicySettings";
import { SubjectRequests } from "@/components/SubjectRequests";
import { Button, ErrorNote, inputCls, cx } from "@/components/ui";
import { readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";

interface Profile {
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  organisation: string;
  ai_training: boolean;
  ai_training_changed_at: string | null;
  email_notifications: boolean;
}

interface Usage {
  ai: { calls: number; input: number; output: number; images: number; media: number };
  cases: number;
  evidence: number;
  runs: number;
  workflows: number;
  ai_configured: boolean;
}

const GROUPS: { label: string; items: { key: string; label: string; icon: IconName }[] }[] = [
  {
    label: "Personal",
    items: [
      { key: "account", label: "Account", icon: "user" },
      { key: "privacy", label: "Privacy", icon: "shieldCheck" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "general", label: "General", icon: "building" },
      { key: "members", label: "Members", icon: "members" },
      { key: "usage", label: "Usage", icon: "usage" },
      { key: "policy", label: "Processing policy", icon: "shield" },
      { key: "subjects", label: "Data subjects", icon: "idCard" },
      { key: "trash", label: "Trash", icon: "trash" },
    ],
  },
  { label: "Tools", items: [{ key: "connections", label: "Connections", icon: "plug" }] },
];
const KEYS = [...GROUPS.flatMap((g) => g.items.map((i) => i.key)), "help"];

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = KEYS.includes(params.get("tab") ?? "") ? params.get("tab")! : "account";
  const navCls = (on: boolean) => cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px]", on ? "bg-hover font-medium text-ink" : "text-ink hover:bg-hover");

  return (
    <div className="flex h-dvh bg-canvas">
      <nav className="flex w-[240px] shrink-0 flex-col px-3 py-4" aria-label="Settings">
        <Link href="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-ink hover:bg-hover">
          <Icon name="arrowLeft" size={15} /> Back to app
        </Link>
        <div className="mt-4 flex-1 space-y-5 overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-2.5 pb-1.5 text-[12px] text-muted">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((i) => (
                  <button key={i.key} onClick={() => router.replace(`/settings?tab=${i.key}`)} aria-current={tab === i.key ? "page" : undefined} className={navCls(tab === i.key)}>
                    <Icon name={i.icon} size={16} className="text-muted" /> {i.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => router.replace("/settings?tab=help")} aria-current={tab === "help" ? "page" : undefined} className={navCls(tab === "help")}>
          <Icon name="help" size={16} className="text-muted" /> Get help
        </button>
      </nav>

      <main className="scroll-panel my-2 mr-2 min-w-0 flex-1 rounded-2xl border border-line bg-panel">
        {/* Connections is a grid of cards, four to a row, so it gets a wider column. */}
        <div className={cx("mx-auto px-8 pb-20 pt-14", tab === "connections" ? "max-w-[1120px]" : "max-w-[680px]")}>
          {tab === "account" && <Account />}
          {tab === "privacy" && <Privacy />}
          {tab === "general" && <General />}
          {tab === "members" && <Members />}
          {tab === "usage" && <UsageTab />}
          {tab === "policy" && (
            <Page title="Processing policy">
              <PolicySettings />
            </Page>
          )}
          {tab === "subjects" && (
            <Page title="Data subjects">
              <SubjectRequests />
            </Page>
          )}
          {tab === "trash" && <Trash />}
          {tab === "connections" && <Connections />}
          {tab === "help" && <Help />}
        </div>
      </main>
    </div>
  );
}

function Page({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <>
      <h1 className="text-[32px] font-medium leading-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-[14px] text-muted">{sub}</p>}
      <div className="mt-10 space-y-10">{children}</div>
    </>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id}>
      <h2 className="pb-3 text-[15px] font-medium">{title}</h2>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
    </label>
  );
}

const initialsOf = (name: string) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[#d9822b] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </span>
  );
}

function Account() {
  const p = useApi<{ profile: Profile }>("/api/me");
  const [draft, setDraft] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profile = p.data?.profile;
  const form = draft ?? (profile ? { name: profile.name, email: profile.email ?? "" } : null);

  const save = async () => {
    if (!form) return;
    setError(null);
    try {
      await api("/api/me", { method: "PATCH", json: { name: form.name, email: form.email || null } });
      setDraft(null);
      toast("Profile saved");
      await p.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <Page title="Account" sub="Your profile and sign-in.">
      {form && (
        <Section title="Profile">
          <div className="space-y-5">
            <div>
              <span className="mb-2 block text-[13px] font-medium">Display picture</span>
              <Avatar name={form.name} size={64} />
            </div>
            <Row label="Full name">
              <input value={form.name} onChange={(e) => setDraft({ ...form, name: e.target.value })} className={inputCls} />
            </Row>
            <Row label="Email">
              <input value={form.email} type="email" onChange={(e) => setDraft({ ...form, email: e.target.value })} placeholder="Optional" className={inputCls} />
            </Row>
            <Row label="Username">
              <input value={profile?.username ?? ""} disabled className={cx(inputCls, "bg-subtle text-muted")} />
            </Row>
            {error && <ErrorNote>{error}</ErrorNote>}
            {draft && (
              <div className="flex gap-2">
                <Button variant="primary" disabled={!form.name.trim()} onClick={() => void save()}>Save changes</Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            )}
          </div>
        </Section>
      )}
      <Password />
      <ThemePreference />
      {profile && <Notifications on={profile.email_notifications} onSaved={() => void p.reload()} />}
      <YourData />
    </Page>
  );
}

/** Light, dark or follow the system; remembered in this browser. */
function ThemePreference() {
  const [choice, setChoice] = useState<ThemeChoice>(() => (typeof window === "undefined" ? "light" : readTheme()));
  const options: { key: ThemeChoice; label: string; icon: IconName }[] = [
    { key: "system", label: "System", icon: "monitor" },
    { key: "light", label: "Light mode", icon: "sun" },
    { key: "dark", label: "Dark mode", icon: "moon" },
  ];
  return (
    <Section title="Preference">
      <p className="-mt-2 mb-4 text-[13px] text-muted">Choose how Veyra looks on this device.</p>
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Appearance">
        {options.map((o) => (
          <button
            key={o.key}
            role="radio"
            aria-checked={choice === o.key}
            onClick={() => {
              setChoice(o.key);
              saveTheme(o.key);
            }}
            className={cx("flex flex-col items-center gap-2.5 rounded-xl border px-3 py-5 text-[14px]", choice === o.key ? "border-transparent bg-subtle font-medium" : "border-line hover:bg-subtle")}
          >
            <Icon name={o.icon} size={20} className="text-muted" />
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function Notifications({ on, onSaved }: { on: boolean; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const save = async (next: boolean) => {
    setSaving(true);
    try {
      await api("/api/me", { method: "PATCH", json: { email_notifications: next } });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { tone: "danger" });
    }
    setSaving(false);
  };
  return (
    <Section title="Notifications">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[14px] font-medium">Email notifications</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">Get an email when someone asks you to review a section, a contributor uploads evidence, or a case pack is approved.</p>
        </div>
        <Switch on={on} label="Email notifications" disabled={saving} onChange={(next) => void save(next)} />
      </div>
    </Section>
  );
}

function YourData() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", { method: "DELETE", json: { confirm: "DELETE" } });
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the account");
      setBusy(false);
    }
  };
  return (
    <Section title="Your data">
      <div className="-mt-1 space-y-6">
        <div className="flex items-center justify-between gap-6">
          <p className="text-[14px] font-medium">Export your data</p>
          <a href="/api/me/export" download className="inline-flex h-8 shrink-0 items-center rounded-lg border border-line-strong bg-panel px-3 text-[13px] font-medium hover:bg-subtle">
            Export
          </a>
        </div>
        <div className="flex items-center justify-between gap-6">
          <p className="text-[14px] font-medium">Delete account</p>
          {!confirming && (
            <button onClick={() => setConfirming(true)} className="h-8 shrink-0 rounded-lg bg-danger-soft px-3 text-[13px] font-medium text-danger hover:brightness-95">
              Delete account
            </button>
          )}
        </div>
        {confirming && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft/50 p-4">
            <p className="text-[13px]">
              Type <span className="tabular-nums font-medium">DELETE</span> to confirm. This can&apos;t be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" className={cx(inputCls, "max-w-[200px]")} />
              <button onClick={() => void remove()} disabled={typed !== "DELETE" || busy} className="h-[38px] rounded-lg bg-danger px-3 text-[13px] font-medium text-white disabled:opacity-40">
                {busy ? "Deleting…" : "Delete my account"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                  setError(null);
                }}
                className="h-[38px] rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink"
              >
                Cancel
              </button>
            </div>
            {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          </div>
        )}
      </div>
    </Section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setError(null);
    if (next !== confirm) return setError("The new passwords don't match.");
    try {
      await api("/api/me/password", { method: "POST", json: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password");
    }
  };

  return (
    <Section title="Password">
      <div className="space-y-5">
        <Row label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={inputCls} />
        </Row>
        <div className="grid gap-5 sm:grid-cols-2">
          <Row label="New password">
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="At least 5 characters" className={inputCls} />
          </Row>
          <Row label="Confirm new password">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputCls} />
          </Row>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button variant="primary" disabled={!current || next.length < 5} onClick={() => void change()}>Change password</Button>
      </div>
    </Section>
  );
}

function General() {
  const p = useApi<{ profile: Profile }>("/api/me");
  const [org, setOrg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profile = p.data?.profile;
  const admin = profile?.role === "admin";
  const value = org ?? profile?.organisation ?? "";

  const save = async () => {
    setError(null);
    try {
      await api("/api/me", { method: "PATCH", json: { organisation: value } });
      setOrg(null);
      toast("Workspace renamed");
      await p.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <Page title="General" sub="Workspace name and language.">
      <Section title="Workspace">
        <div className="space-y-5">
          <Row label="Workspace name">
            <input value={value} disabled={!admin} onChange={(e) => setOrg(e.target.value)} className={cx(inputCls, !admin && "bg-subtle text-muted")} />
          </Row>
          {!admin && profile && <p className="-mt-3 text-[12px] text-faint">Only an admin can rename the workspace.</p>}
          {error && <ErrorNote>{error}</ErrorNote>}
          {org !== null && org !== profile?.organisation && (
            <div className="flex gap-2">
              <Button variant="primary" disabled={!value.trim()} onClick={() => void save()}>Save changes</Button>
              <Button variant="ghost" onClick={() => setOrg(null)}>Cancel</Button>
            </div>
          )}
        </div>
      </Section>
      <Section title="Language" id="language">
        <Row label="Interface language">
          <select className={inputCls} value="en-GB" onChange={() => {}}>
            <option value="en-GB">English (UK)</option>
          </select>
        </Row>
      </Section>
    </Page>
  );
}

function Members() {
  const { data } = useApi<{ members: { id: string; name: string; email: string | null; username: string | null; role: string; created_at: string; you: boolean }[]; teams: { id: string; name: string }[] }>("/api/members");
  return (
    <Page title="Members" sub="People and teams in this workspace.">
      <Section title={`People${data ? ` · ${data.members.length}` : ""}`}>
        <ul className="">
          {data?.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {m.name} {m.you && <span className="font-normal text-faint">(you)</span>}
                </p>
                <p className="truncate text-[12.5px] text-muted">{m.email ?? m.username}</p>
              </div>
              <span className="rounded-md bg-subtle px-2 py-0.5 text-[12px] capitalize text-muted">{m.role}</span>
            </li>
          ))}
        </ul>
      </Section>
      {!!data?.teams.length && (
        <Section title={`Teams · ${data.teams.length}`}>
          <ul className="">
            {data.teams.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#6b4fc8] text-[11px] font-semibold text-white">{initialsOf(t.name)}</span>
                <p className="text-[14px] font-medium">{t.name}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}

interface TrashedCase {
  id: string;
  reference: string;
  title: string;
  deleted_at: string;
  deleted_by_name: string | null;
  legal_hold: boolean;
  files: number;
  purge_at: string;
}

function Trash() {
  const { data, reload } = useApi<{ cases: TrashedCase[] }>("/api/trash");
  const [erasing, setErasing] = useState<TrashedCase | null>(null);

  const restore = async (c: TrashedCase) => {
    try {
      await api(`/api/cases/${c.id}/restore`, { method: "POST" });
      toast(`Restored “${c.title}”`);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not restore the case", { tone: "danger" });
    }
  };

  return (
    <Page title="Trash" sub="Deleted cases stay here for 30 days, then they and their evidence are erased.">
      {data && data.cases.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
          <Icon name="trash" size={22} className="text-faint" />
          <p className="mt-2 text-[14px] text-muted">The trash is empty</p>
        </div>
      ) : (
        <ul className="">
          {data?.cases.map((c) => (
            <li key={c.id} className="flex items-center gap-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.title.replace(/^DEMO · /, "")}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  <span className="tabular-nums">{c.reference}</span> · {c.files} file{c.files === 1 ? "" : "s"} · Deleted {formatDateTime(c.deleted_at)}
                  {c.deleted_by_name ? ` by ${c.deleted_by_name}` : ""}
                </p>
                <p className={cx("mt-0.5 text-[12px]", c.legal_hold ? "text-draft" : "text-faint")}>
                  {c.legal_hold ? "On legal hold, so it won't be erased" : `Erased ${formatDateTime(c.purge_at)}`}
                </p>
              </div>
              <Button onClick={() => void restore(c)}>Restore</Button>
              {!c.legal_hold && (
                <button onClick={() => setErasing(c)} className="h-8.5 rounded-lg px-3 text-[13px] font-medium text-danger hover:bg-danger-soft">
                  Delete forever
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {erasing && <EraseDialog c={erasing} onClose={() => setErasing(null)} onDone={() => { setErasing(null); void reload(); }} />}
    </Page>
  );
}

function EraseDialog({ c, onClose, onDone }: { c: TrashedCase; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${c.id}?permanent=1`, { method: "DELETE", json: { confirmReference: typed.trim() } });
      toast(`Erased “${c.title}”`, { tone: "danger" });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not erase the case");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()} role="dialog" aria-modal="true" aria-label="Delete case forever">
      <div className="w-full max-w-[420px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <p className="text-[16px] font-semibold">Delete “{c.title}” forever?</p>
        <p className="mt-1.5 text-[13px] text-muted">The case, its evidence files, analysis, findings, conversation and saved versions are erased. This can&apos;t be undone.</p>
        <label className="mt-4 block text-[12px] font-medium text-muted">
          Type <span className="tabular-nums text-ink">{c.reference}</span> to confirm
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong px-3 py-2 text-sm outline-none focus:border-danger" />
        </label>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-subtle">Cancel</button>
          <button disabled={typed.trim() !== c.reference || busy} onClick={() => void erase()} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-medium text-white disabled:opacity-40">
            {busy ? "Erasing…" : "Delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Integration {
  key: string;
  name: string;
  icon: IconName;
  description: string;
  /** Known live state on this server; undefined when it can't be checked. */
  connected?: boolean;
  setup?: string;
  /** Brand mark in /public/logos; the icon is used when there is none. */
  logo?: string;
  by: string;
}

function Connections() {
  const { data } = useApi<{ claude: boolean; clamav: string | null; elevenlabs: boolean }>("/api/connections");
  // One list, most relevant to legal and investigation work first. Only Claude, ClamAV and
  // Find Case Law are live in this prototype; the rest show what would connect.
  const items: Integration[] = [
    { key: "claude", name: "Claude", logo: "claude.png", by: "Anthropic", icon: "claude", description: "Reads evidence, drafts observations and findings, and answers questions in the case chat.", connected: data?.claude, setup: "Set ANTHROPIC_API_KEY on the server, then restart the app and worker." },
    { key: "elevenlabs", name: "ElevenLabs", by: "ElevenLabs", icon: "mic", description: "Transcribes recordings with Scribe, with speakers and sound events. Used only when your processing policy approves it; otherwise transcription stays on this server.", connected: data?.elevenlabs, setup: "Set ELEVENLABS_API_KEY on the server, approve ElevenLabs in the processing policy, then restart the app and worker." },
    { key: "caselaw", name: "Find Case Law", logo: "find-case-law.png", by: "The National Archives", icon: "scales", description: "Search judgments and link them to findings as precedents.", connected: true },
    { key: "westlaw", name: "Westlaw UK", logo: "westlaw.png", by: "Thomson Reuters", icon: "book", description: "Search case law, legislation and journals, and pull citations into findings." },
    { key: "lexis", name: "LexisNexis", logo: "lexisnexis.png", by: "LexisNexis", icon: "book", description: "Lexis+ case law and commentary alongside the evidence that raises the question." },
    { key: "practicallaw", name: "Practical Law", logo: "practical-law.png", by: "Thomson Reuters", icon: "book", description: "Link practice notes and checklists to a case's open questions." },
    { key: "vlex", name: "vLex", logo: "vlex.svg", by: "vLex", icon: "scales", description: "Search UK and international case law and legislation from a finding." },
    { key: "attio", name: "Attio", logo: "attio.png", by: "Attio", icon: "crm", description: "Link cases to companies and people in your CRM and log case activity against them." },
    { key: "hubspot", name: "HubSpot", logo: "hubspot.png", by: "HubSpot", icon: "crm", description: "Create a case from a deal or ticket, and keep the contact record up to date." },
    { key: "salesforce", name: "Salesforce", logo: "salesforce.svg", by: "Salesforce", icon: "crm", description: "Sync cases with accounts and contacts, and push case status to the record." },
    { key: "clio", name: "Clio", logo: "clio.png", by: "Clio", icon: "briefcase", description: "Match cases to Clio matters, with clients, deadlines and time recorded there." },
    { key: "imanage", name: "iManage", logo: "imanage.png", by: "iManage", icon: "database", description: "Import documents from a workspace into the vault and file case packs back." },
    { key: "netdocuments", name: "NetDocuments", logo: "netdocuments.jpg", by: "NetDocuments", icon: "database", description: "Bring matter documents into the vault with their version history." },
    { key: "m365", name: "Microsoft 365", logo: "microsoft-365.svg", by: "Microsoft", icon: "microsoft", description: "Import files from SharePoint and OneDrive into a vault folder, with their history." },
    { key: "gdrive", name: "Google Drive", logo: "google-drive.svg", by: "Google", icon: "drive", description: "Import files from shared drives, keeping who shared them and when." },
    { key: "docusign", name: "DocuSign", logo: "docusign.png", by: "Docusign", icon: "signature", description: "Send an approved case pack for signature and keep the signed copy with the case." },
    { key: "companies", name: "Companies House", logo: "gov-uk.png", by: "GOV.UK", icon: "building", description: "Confirm a company's name, status, officers and filing history." },
    { key: "landregistry", name: "HM Land Registry", logo: "gov-uk.png", by: "GOV.UK", icon: "home", description: "Check title registers and ownership for property in a case." },
    { key: "dvla", name: "DVLA vehicle enquiry", logo: "gov-uk.png", by: "GOV.UK", icon: "car", description: "Check a registration against make, colour and tax status." },
    { key: "slack", name: "Slack", logo: "slack.svg", by: "Slack", icon: "slack", description: "Post review requests, approvals and flagged files to a channel." },
    { key: "teams", name: "Microsoft Teams", logo: "microsoft-teams.png", by: "Microsoft", icon: "microsoft", description: "Send review requests and approvals to a Teams channel." },
    { key: "smtp", name: "Email delivery", by: "Your mail server", icon: "mail", description: "Send sign-in codes, upload links and review requests by email." },
    { key: "clamav", name: "ClamAV", logo: "clamav.png", by: "Cisco Talos", icon: "virus", description: "Scans every upload for malware before it reaches the vault.", connected: data ? !!data.clamav : undefined, setup: "Install ClamAV on the server so clamscan or clamdscan is on the PATH." },
  ];

  return (
    <Page title="Connections" sub="Legal research, CRMs, document systems and checks Veyra can work with.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <IntegrationCard key={i.key} i={i} />
        ))}
      </div>
    </Page>
  );
}

function IntegrationCard({ i }: { i: Integration }) {
  const [showSetup, setShowSetup] = useState(false);
  const live = i.connected !== undefined || i.setup;
  return (
    <div className="flex flex-col rounded-2xl bg-subtle p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={cx("grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line", i.logo ? "bg-white" : "bg-panel")}>
          {i.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- small static brand marks
            <img src={`/logos/${i.logo}`} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          ) : (
            <Icon name={i.icon} size={22} className="text-ink" />
          )}
        </span>
        {i.connected ? (
          <span title="Connected" aria-label="Connected" className="grid h-8 w-8 place-items-center rounded-lg bg-ok-soft text-ok">
            <Icon name="check" size={18} />
          </span>
        ) : (
          <button
            onClick={() => (live ? setShowSetup((s) => !s) : toast(`${i.name} isn't available in this prototype yet`))}
            aria-label={`Connect ${i.name}`}
            title={live ? "Set up" : "Connect"}
            className="grid h-8 w-8 place-items-center rounded-lg bg-hover text-ink hover:bg-line"
          >
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      <p className="mt-3 text-[14.5px] font-medium">{i.name}</p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{i.description}</p>
      <p className="mt-1.5 text-[12.5px] text-faint">by {i.by}</p>
      {showSetup && i.setup && <p className="mt-3 rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink">{i.setup}</p>}
    </div>
  );
}

/** How Veyra handles personal data, and each person's own choices about it. */
function Privacy() {
  const router = useRouter();
  const p = useApi<{ profile: Profile }>("/api/me");
  const training = p.data?.profile.ai_training ?? false;
  const [saving, setSaving] = useState(false);
  const setTraining = async (on: boolean) => {
    setSaving(true);
    try {
      await api("/api/me", { method: "PATCH", json: { ai_training: on } });
      await p.reload();
      toast(on ? "Thanks: your chats and feedback can now help improve Veyra" : "Your chats and feedback won't be used to improve Veyra");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { tone: "danger" });
    }
    setSaving(false);
  };
  const manage = (label: string, tab: string) => (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="text-[14px]">{label}</span>
      <Button size="sm" onClick={() => router.replace(`/settings?tab=${tab}`)}>Manage</Button>
    </div>
  );

  return (
    <Page title="Privacy" sub="How Veyra protects and uses your data, and the choices you have.">
      <section className="">
        <Disclosure title="How we protect your data">
          <li>Original files are encrypted when stored and can only be opened by signed-in members of your workspace. There are no public links to them.</li>
          <li>Names and other direct identifiers are masked before case content is sent to the AI provider, and restored in what comes back.</li>
          <li>Your organisation&apos;s processing policy decides what, if anything, may be sent to an AI provider.</li>
          <li>Deleted cases stay in the trash for 30 days and are then erased, unless they are on legal hold.</li>
        </Disclosure>
        <Disclosure title="How we use your data">
          <li>Your cases and evidence are used to provide Veyra to your organisation: analysis, findings and case packs.</li>
          <li>With your permission, your chats with Veyra and the feedback you give on its answers can be used to train and improve Veyra&apos;s AI. Evidence files and case packs are never used for this.</li>
          <li>We don&apos;t sell your data.</li>
        </Disclosure>
      </section>

      <Section title="Preferences">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[14px] font-medium">Help improve Veyra&apos;s AI</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Allow your chats with Veyra and your feedback to be used to train and improve Veyra&apos;s AI. Evidence files are never used. Off unless you turn it on.
            </p>
            {p.data?.profile.ai_training_changed_at && <p className="mt-1 text-[12px] text-faint">Last changed {formatDateTime(p.data.profile.ai_training_changed_at)}</p>}
          </div>
          <Switch on={training} label="Help improve Veyra's AI" disabled={!p.data || saving} onChange={(on) => void setTraining(on)} />
        </div>
      </Section>

      <Section title="Your data">
        <div className="-mt-3.5 ">
          {manage("Deleted cases", "trash")}
          {manage("Data subject requests", "subjects")}
          {manage("Processing policy", "policy")}
        </div>
      </Section>
    </Page>
  );
}

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60", on ? "bg-primary" : "bg-line-strong")}
    >
      <span className={cx("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", on && "translate-x-5")} />
    </button>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-1">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-3 text-left text-[14px] font-medium">
        {title}
        <Icon name="chevron" size={16} className={cx("text-muted transition-transform", open ? "-rotate-90" : "rotate-90")} />
      </button>
      {open && <ul className="list-disc space-y-1.5 pb-4 pl-5 text-[13.5px] leading-relaxed text-muted">{children}</ul>}
    </div>
  );
}

function UsageTab() {
  const u = useApi<{ usage: Usage }>("/api/usage", { pollMs: 30000 });
  const d = u.data?.usage;
  const fmt = (n: number) => n.toLocaleString("en-GB");
  const tiles = (rows: [string, number][]) => (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map(([l, v]) => (
        <div key={l} className="rounded-xl bg-subtle px-3.5 py-3">
          <dt className="text-[11.5px] text-muted">{l}</dt>
          <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">{fmt(v)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <Page title="Usage">
      <Section title="Workspace">{d && tiles([["Cases", d.cases], ["Evidence items", d.evidence], ["Analysis runs", d.runs], ["Workflow runs", d.workflows]])}</Section>
      <Section title="AI">
        {d && (
          <>
            {!d.ai_configured && <p className="mb-3 text-[13px] text-muted">Claude isn&apos;t connected, so sample cases use hand-written demo analysis.</p>}
            {tiles([["AI calls", d.ai.calls], ["Input tokens", d.ai.input], ["Output tokens", d.ai.output], ["Frames sent", d.ai.images]])}
          </>
        )}
      </Section>
    </Page>
  );
}

function Help() {
  return (
    <Page title="Get help">
      <Section title="How Veyra works">
        <ul className="space-y-3 text-[13.5px]">
          <li><span className="font-medium">Ask Veyra.</span> <span className="text-muted">In any case, ask the assistant what it can do or how to find something.</span></li>
          <li><span className="font-medium">Analyse.</span> <span className="text-muted">Extracts source-linked observations, checks each file for tampering and AI-generation indicators, then compares items.</span></li>
          <li><span className="font-medium">Review.</span> <span className="text-muted">Checks a case for anything that would undermine it: integrity concerns, untraceable findings, unresolved conflicts, review gaps.</span></li>
          <li><span className="font-medium">Vault.</span> <span className="text-muted">Upload originals or send someone a private upload link.</span></li>
        </ul>
      </Section>
      <Section title="About Veyra" id="about">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Veyra helps you turn mixed evidence into a reviewed, source-linked case pack. Every AI or demo claim cites its source, and nothing is treated as reviewed until a person accepts it. Integrity checks read file metadata; an indicator means &ldquo;verify provenance&rdquo;, not proof of tampering.
        </p>
      </Section>
    </Page>
  );
}
