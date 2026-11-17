"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, formatBytes, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { RequestEvidenceModal } from "@/components/RequestEvidenceModal";
import { Popover } from "@/components/Popover";
import { ErrorNote, cx, inputCls } from "@/components/ui";

interface Folder {
  id: string;
  title: string;
  reference: string;
  updated_at: string;
  is_demo: boolean;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  bytes: number;
  files: number;
  invites: number;
  contributed: number;
  subfolders: number;
  /** Case folders: the case this folder belongs to. */
  case_id: string | null;
  case_title: string | null;
}

const TABS = [
  ["all", "All folders"],
  ["cases", "Case folders"],
  ["contributors", "With contributors"],
  ["pinned", "Pinned"],
  ["archived", "Archived"],
] as const;

/** The vault: case folders and standalone folders (with subfolders) of original files. Any case can use any file. */
export default function VaultPage() {
  const router = useRouter();
  const vault = useApi<{ folders: Folder[] }>("/api/vault", { pollMs: 15000 });
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Folder | null>(null);
  const [requesting, setRequesting] = useState(false);

  const folders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (vault.data?.folders ?? [])
      .filter((f) => (tab === "archived" ? f.archived : !f.archived))
      .filter((f) => (tab === "cases" ? !!f.case_id : tab === "contributors" ? f.invites > 0 || f.contributed > 0 : tab === "pinned" ? f.pinned : true))
      .filter((f) => !q || `${f.title} ${f.reference}`.toLowerCase().includes(q));
  }, [vault.data, tab, query]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await vault.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <AppShell breadcrumb={<Crumb current>Vault</Crumb>}>
      <div className="scroll-panel h-full bg-panel">
        <div className="mx-auto max-w-[1080px] px-8 pb-16 pt-10">
          <h1 className="text-[26px] font-medium ">Vault</h1>

          <div className="mt-6 grid gap-x-8 gap-y-2 lg:max-w-[860px] lg:grid-cols-2">
            <CreateFolderCard onCreated={(id) => router.push(`/vault/${id}`)} />
            <button onClick={() => setRequesting(true)} className="flex items-center gap-4 rounded-2xl p-2 pr-4 text-left hover:bg-subtle">
              <span className="grid h-[42px] w-[60px] shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                <Icon name="request" size={18} />
              </span>
              <span>
                <span className="block text-[14px] font-medium">Request evidence</span>
                <span className="mt-0.5 block text-[13px] text-muted">Invite victims, witnesses or anyone connected to a case to upload theirs.</span>
              </span>
            </button>
          </div>

          <div className="mt-16 flex flex-wrap items-center gap-1">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={cx("h-8 rounded-full px-3.5 text-[13px]", tab === k ? "bg-subtle font-medium text-ink" : "text-muted hover:text-ink")}>
                {l}
              </button>
            ))}
          </div>
          <label className="mt-3 flex h-9 w-72 max-w-full items-center gap-1.5 rounded-lg bg-subtle px-3 text-muted">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search folders" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
          </label>
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
            {folders.map((f) => {
              const shared = f.invites > 0 || f.contributed > 0;
              return (
                <div key={f.id} className="group min-w-0">
                  <Link href={`/vault/${f.id}`} className="grid h-[150px] place-items-center rounded-xl bg-[#f4f4f2] transition-colors hover:bg-[#ececea]">
                    <FolderGlyph shared={shared} />
                  </Link>
                  <div className="mt-2 flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      {renaming?.id === f.id ? (
                        <input
                          autoFocus
                          value={renaming.title}
                          aria-label="Folder name"
                          onChange={(e) => setRenaming({ id: f.id, title: e.target.value })}
                          onBlur={() => {
                            const t = renaming.title.trim();
                            setRenaming(null);
                            if (t) void act(() => api(`/api/cases/${f.id}`, { method: "PATCH", json: { title: t } }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className={cx(inputCls, "py-0.5 text-[13px]")}
                        />
                      ) : (
                        <Link href={`/vault/${f.id}`} className="flex items-center gap-1.5 text-[13px] font-medium">
                          <span className="truncate">{f.title.replace(/^DEMO · /, "")}</span>
                          {f.pinned && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8b7fd1]" title="Pinned" />}
                        </Link>
                      )}
                      <p className="truncate text-[12px] text-muted">
                        {f.files.toLocaleString("en-GB")} item{f.files === 1 ? "" : "s"}
                        {f.subfolders ? ` · ${f.subfolders} folder${f.subfolders === 1 ? "" : "s"}` : ""}
                        {f.case_id ? " · Case folder" : ""}
                        {shared ? " · Shared" : ""}
                      </p>
                    </div>
                    <Menu
                      align="right"
                      width={200}
                      items={[
                        { label: "Edit", icon: "pencil", onSelect: () => setRenaming({ id: f.id, title: f.title }) },
                        { label: f.archived ? "Unarchive" : "Archive", icon: "archive", onSelect: () => void act(() => api(`/api/cases/${f.id}`, { method: "PATCH", json: { archived: !f.archived } }).then(() => toast(f.archived ? "Folder restored" : "Folder archived"))) },
                        { label: "Get info", icon: "info", onSelect: () => setInfo(f) },
                      ]}
                      trigger={({ toggle, ref, open }) => (
                        <button ref={ref} onClick={toggle} aria-label={`More options for ${f.title.replace(/^DEMO · /, "")}`} aria-expanded={open} className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink focus:opacity-100", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                          <Icon name="moreH" size={15} />
                        </button>
                      )}
                    />
                  </div>
                </div>
              );
            })}
            {vault.data && folders.length === 0 && <p className="col-span-full py-10 text-center text-[13px] text-muted">No folders here.</p>}
          </div>
          {info && <FolderInfo f={info} onClose={() => setInfo(null)} />}
          {requesting && <RequestEvidenceModal onClose={() => setRequesting(false)} onCreated={() => void vault.reload()} />}
        </div>
      </div>
    </AppShell>
  );
}

function FolderInfo({ f, onClose }: { f: Folder; onClose: () => void }) {
  const rows: [string, string][] = [
    ...(f.case_title ? ([["Case", f.case_title.replace(/^DEMO · /, "")]] as [string, string][]) : []),
    ["Items", f.files.toLocaleString("en-GB")],
    ["Subfolders", String(f.subfolders)],
    ["Size", formatBytes(f.bytes)],
    ["Contributed by invitees", String(f.contributed)],
    ["Active upload links", String(f.invites)],
    ["Created", formatDateTime(f.created_at)],
    ["Last changed", formatDateTime(f.updated_at)],
    ["Status", f.archived ? "Archived" : f.pinned ? "Pinned" : "Active"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Folder info">
      <div className="w-full max-w-[380px] rounded-2xl bg-panel p-5 shadow-[var(--shadow-dialog)]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-semibold">{f.title.replace(/^DEMO · /, "")}</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <dl className="mt-4 space-y-2 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function CreateFolderCard({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try {
      const r = await api<{ folder: { id: string } }>("/api/vault", { method: "POST", json: { name: name.trim() } });
      onCreated(r.folder.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the folder");
    }
  };
  return (
    <Popover
      align="left"
      width={340}
      trigger={({ toggle, ref }) => (
        <button ref={ref} onClick={toggle} className="flex items-center gap-4 rounded-2xl p-2 pr-4 text-left hover:bg-subtle">
          <span className="grid h-[42px] w-[60px] shrink-0 place-items-center rounded-lg bg-subtle text-muted">
            <Icon name="plus" size={18} />
          </span>
          <span>
            <span className="block text-[14px] font-medium">Create folder</span>
            <span className="mt-0.5 block text-[13px] text-muted">Upload a new collection of evidence files or folders.</span>
          </span>
        </button>
      )}
    >
      {() => (
        <div className="space-y-2 p-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()} placeholder="Folder name, e.g. Site photos 2026" aria-label="Folder name" className={inputCls} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button disabled={!name.trim()} onClick={() => void create()} className="w-full rounded-lg bg-primary py-1.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:bg-line-strong">
            Create folder
          </button>
        </div>
      )}
    </Popover>
  );
}

function FolderGlyph({ shared }: { shared: boolean }) {
  return (
    <svg width="64" height="52" viewBox="0 0 64 52" aria-hidden>
      <path d="M2 8a6 6 0 0 1 6-6h14l6 6h28a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8Z" fill="#cfcdc9" />
      {shared && (
        <g fill="#f4f4f2">
          <circle cx="27" cy="23" r="4.5" />
          <circle cx="38" cy="23" r="4.5" />
          <path d="M19 37c0-4.4 3.6-7 8-7s8 2.6 8 7v1H19v-1ZM33 38v-1c0-2-.6-3.7-1.7-5 1.8-1.3 3.9-2 6.7-2 4.4 0 8 2.6 8 7v1H33Z" />
        </g>
      )}
    </svg>
  );
}
