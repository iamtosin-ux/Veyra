"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, formatBytes, formatDateTime, useApi } from "@/lib/client";
import { toast } from "@/lib/toast";
import { AppShell, Crumb } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { evidenceIcon } from "@/components/EvidenceModal";
import { ComplianceChip, IntegrityBadge, ProgressRing, needsAttention, type IntegrityReport, type IntegrityReview } from "@/components/Integrity";
import { EvidenceModal } from "@/components/EvidenceModal";
import { Menu, type MenuItem } from "@/components/Menu";
import { CollaboratorsModal, type Invite } from "@/components/CollaboratorsModal";
import { AddToCaseModal } from "@/components/AddToCaseModal";
import { Button, Chip, ErrorNote, cx } from "@/components/ui";
import type { CaseData, EvidenceItem } from "@/components/case/types";

interface Declared {
  source: string;
  category: string;
}

export default function VaultFolderPage() {
  return (
    <Suspense>
      <VaultFolder />
    </Suspense>
  );
}

function VaultFolder() {
  const { caseId } = useParams<{ caseId: string }>();
  const inviteFocus = useSearchParams().get("invite") === "1";
  const [uploadOpen, setUploadOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(inviteFocus);
  const detail = useApi<CaseData>(`/api/cases/${caseId}`, { pollMs: 6000 });
  const integrity = useApi<{ reports: Record<string, IntegrityReport>; pending: string[]; reviews: Record<string, IntegrityReview> }>(`/api/cases/${caseId}/integrity`, { pollMs: 15000 });
  const [checking, setChecking] = useState<{ total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<EvidenceItem | null>(null);
  const pending = integrity.data?.pending ?? [];
  const invites = useApi<{ invites: Invite[]; owner: { name: string } | null }>(`/api/cases/${caseId}/invites`);
  // Where the folder sits, the case it belongs to (if any) and its subfolders.
  const place = useApi<{ folder: { case: { id: string; title: string; reference: string } | null }; path: { id: string; title: string }[]; subfolders: { id: string; title: string; files: number; subfolders: number }[] }>(`/api/vault/${caseId}`);
  const [newSub, setNewSub] = useState<string | null>(null);
  const createSub = async () => {
    const name = newSub?.trim();
    if (!name) return setNewSub(null);
    try {
      await api("/api/vault", { method: "POST", json: { name, parentId: caseId } });
      setNewSub(null);
      await place.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the folder");
    }
  };
  const activeInvites = (invites.data?.invites ?? []).filter((i) => i.active).length;
  // The owner first, then each person invited to add to this folder.
  const people = [...(invites.data?.owner ? [invites.data.owner.name] : []), ...(invites.data?.invites ?? []).filter((i) => i.active).map((i) => i.name || i.label)];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const declaredRef = useRef<Declared>({ source: "", category: "" });
  const folderRef = useRef<HTMLInputElement>(null);

  const c = detail.data?.case;
  const evidence = useMemo(() => detail.data?.evidence ?? [], [detail.data]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append("files", f);
      if (declaredRef.current.source.trim()) fd.append("declared_source", declaredRef.current.source.trim());
      if (declaredRef.current.category) fd.append("declared_category", declaredRef.current.category);
      const r = await fetch(`/api/cases/${caseId}/evidence`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
      if (!r?.results?.[0]?.ok) failed.push(`${f.name}: ${r?.results?.[0]?.error ?? r?.error ?? "upload failed"}`);
    }
    setBusy(null);
    declaredRef.current = { source: "", category: "" };
    if (failed.length) setError(failed.join(" · "));
    await detail.reload();
  };

  // Checks run in the background worker; poll quickly while any are outstanding.
  const checkIntegrity = async () => {
    setError(null);
    try {
      const r = await api<{ queued: string[] }>(`/api/cases/${caseId}/integrity`, { method: "POST" });
      setChecking({ total: r.queued.length });
      await integrity.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Integrity check failed");
    }
  };
  const outstanding = pending.length > 0 || !!checking;
  const reloadIntegrity = integrity.reload;
  useEffect(() => {
    if (!outstanding) return;
    const t = setInterval(() => void reloadIntegrity(), 1000);
    return () => clearInterval(t);
  }, [outstanding, reloadIntegrity]);
  useEffect(() => {
    if (!checking || pending.length > 0 || !integrity.data) return;
    // Every queued check has finished: report once, then stop polling.
    const flagged = evidence.filter((e) => needsAttention(integrity.data?.reports[e.id], integrity.data?.reviews[e.id])).length;
    const t = setTimeout(() => {
      setChecking(null);
      toast(flagged ? `Integrity check finished · ${flagged} file${flagged === 1 ? "" : "s"} flagged` : "Integrity check finished · nothing flagged");
    }, 0);
    return () => clearTimeout(t);
  }, [checking, pending.length, integrity.data, evidence]);
  const done = checking ? Math.max(0, checking.total - pending.length) : 0;
  // Files never scanned, or changed since their last scan.
  const stale = evidence.filter((e) => {
    const r = integrity.data?.reports[e.id];
    return integrity.data && (!r || r.checked_at < e.uploaded_at);
  });
  const openItem = evidence.find((e) => e.id === open);

  return (
    <AppShell
      breadcrumb={
        <>
          <Crumb href="/vault">Vault</Crumb>
          {(place.data?.path ?? []).map((p) => (
            <Crumb key={p.id} href={`/vault/${p.id}`}>
              {p.title.replace(/^DEMO · /, "")}
            </Crumb>
          ))}
          <Crumb current>{c?.title.replace(/^DEMO · /, "") ?? "…"}</Crumb>
        </>
      }
      actions={
        <>
          {/* Collaborators: who can add to this folder, and a dotted plus to invite more */}
          <button
            onClick={() => setInviteOpen(true)}
            aria-label={`Collaborators${activeInvites ? `, ${activeInvites} invited` : ""}`}
            title="Collaborators"
            // On a phone this is reached from the Upload menu's "Invite collaborators" instead.
            className="flex h-8 items-center rounded-lg px-1 hover:bg-hover max-sm:hidden"
          >
            <span className="flex -space-x-1.5">
              {people.slice(0, 4).map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className={cx(
                    "grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-panel",
                    i === 0 ? "bg-[#c8613a] text-white" : "bg-panel text-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
                  )}
                >
                  {name.trim()[0]?.toUpperCase() ?? "?"}
                </span>
              ))}
              <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-line-strong bg-panel text-muted ring-2 ring-panel">
                <Icon name="plus" size={14} />
              </span>
            </span>
          </button>
          <button onClick={() => setNewSub("")} aria-label="New subfolder" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium hover:bg-subtle">
            <Icon name="folder" size={13} /> <span className="max-sm:hidden">New subfolder</span>
          </button>
          {/* Split button: upload directly, or invite others to upload theirs. */}
          <div className="inline-flex h-7 overflow-hidden rounded-lg bg-primary text-xs font-medium text-white">
            <button onClick={() => setUploadOpen(true)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-2.5 hover:bg-primary-hover disabled:opacity-60">
              <Icon name="upload" size={13} /> Upload
            </button>
            <Menu
              align="right"
              width={210}
              items={[
                { label: "Upload files", icon: "upload", onSelect: () => setUploadOpen(true) },
                { label: "Invite collaborators", icon: "request", onSelect: () => setInviteOpen(true) },
              ]}
              trigger={({ toggle, ref, open }) => (
                <button ref={ref} onClick={toggle} aria-label="More upload options" aria-expanded={open} className="grid w-7 place-items-center border-l border-white/20 hover:bg-primary-hover">
                  <Icon name="chevron" size={12} className="rotate-90" />
                </button>
              )}
            />
          </div>
        </>
      }
    >
      {/* Leave room for the integrity drawer so it never covers the file list. */}
      <div className="scroll-panel h-full bg-panel">
        <div className={"mx-auto grid max-w-[1160px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-16 pt-6 sm:px-8 sm:pt-8"}>
          <section>
            {detail.error && <ErrorNote>{detail.error}</ErrorNote>}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void upload([...e.dataTransfer.files]);
              }}
              className={cx("flex flex-col items-center rounded-2xl border border-dashed px-6 py-8 text-center", drag ? "border-accent bg-accent-soft" : "border-line-strong")}
            >
              <Icon name="upload" size={20} className="text-muted" />
              <p className="mt-2 text-[13px] font-medium">{busy ?? "Drop evidence here"}</p>
              <p className="mt-0.5 text-[12px] text-muted">Video, audio, images and documents</p>
              <Button size="sm" className="mt-3" onClick={() => setUploadOpen(true)} disabled={!!busy}>Upload files</Button>
              <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <input ref={folderRef} type="file" multiple className="sr-only" {...{ webkitdirectory: "" }} onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </div>
            {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

            {/* Subfolders, when there are any or one is being named */}
            {((place.data?.subfolders.length ?? 0) > 0 || newSub !== null) && (
            <>
            <p className="mt-6 text-[13px] font-medium">Folders <span className="text-faint">{place.data?.subfolders.length ?? 0}</span></p>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {(place.data?.subfolders ?? []).map((f) => (
                <Link key={f.id} href={`/vault/${f.id}`} className="flex items-center gap-2.5 rounded-xl bg-subtle px-3 py-2.5 hover:bg-hover">
                  <Icon name="folder" size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{f.title}</span>
                    <span className="block text-[11.5px] text-faint">
                      {f.files} item{f.files === 1 ? "" : "s"}
                      {f.subfolders ? ` · ${f.subfolders} folder${f.subfolders === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                </Link>
              ))}
              {newSub !== null && (
                <div className="flex items-center gap-2 rounded-xl border border-line-strong px-3 py-2">
                  <Icon name="folder" size={16} className="shrink-0 text-muted" />
                  <input
                    autoFocus
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onBlur={() => void createSub()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createSub();
                      if (e.key === "Escape") setNewSub(null);
                    }}
                    placeholder="Folder name"
                    aria-label="New subfolder name"
                    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
                  />
                </div>
              )}
            </div>
            </>
            )}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] font-medium">Files <span className="text-faint">{evidence.length}</span></p>
              {/* Enabled only when a file has changed since its last scan. */}
              <Button
                size="sm"
                onClick={() => void checkIntegrity()}
                disabled={!stale.length || !!busy || outstanding}
                title={outstanding ? undefined : stale.length ? `${stale.length} file${stale.length === 1 ? "" : "s"} to scan` : "Every file is up to date"}
              >
                {outstanding ? (
                  <>
                    <ProgressRing value={checking?.total ? done / checking.total : undefined} size={14} />
                    {checking?.total ? `Scanning ${done} of ${checking.total}` : "Scanning…"}
                  </>
                ) : (
                  "Integrity scan"
                )}
              </Button>
            </div>
            <ul className="mt-2 ">
              {evidence.map((e) => (
                <FileRow
                  key={e.id}
                  e={e}
                  report={integrity.data?.reports[e.id]}
                  review={integrity.data?.reviews[e.id]}
                  checking={pending.includes(e.id)}
                  onOpen={() => setOpen(e.id)}
                  onAddToCase={() => setAdding(e)}
                  onChanged={() => {
                    void detail.reload();
                    void integrity.reload();
                  }}
                />
              ))}
              {detail.data && evidence.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">This folder is empty.</li>}
            </ul>
          </section>

          {openItem && (
            <EvidenceModal
              key={openItem.id}
              item={openItem}
              context="vault"
              onClose={() => setOpen(null)}
              onChanged={() => {
                void integrity.reload();
                void detail.reload();
              }}
            />
          )}
          {adding && (
            <AddToCaseModal
              file={{ id: adding.id, name: adding.display_name || adding.original_filename }}
              usedIn={(adding.used_in ?? []).map((u) => u.case_id)}
              onClose={() => setAdding(null)}
              onAdded={() => void detail.reload()}
            />
          )}
          {inviteOpen && <CollaboratorsModal caseId={caseId} caseTitle={c?.title.replace(/^DEMO · /, "")} onClose={() => setInviteOpen(false)} onChanged={() => void invites.reload()} />}
          {uploadOpen && (
            <UploadDialog
              onClose={() => setUploadOpen(false)}
              onFiles={(d) => {
                declaredRef.current = d;
                setUploadOpen(false);
                fileRef.current?.click();
              }}
              onFolder={(d) => {
                declaredRef.current = d;
                setUploadOpen(false);
                folderRef.current?.click();
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

const initialsOf = (n: string) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

function FileRow({ e, report, review, checking, onOpen, onAddToCase, onChanged }: { e: EvidenceItem; report?: IntegrityReport; review?: IntegrityReview; checking: boolean; onOpen: () => void; onAddToCase: () => void; onChanged: () => void }) {
  const m = e.metadata as { upload_source?: string; contributor_name?: string | null; contributor_email?: string | null };
  // Who provided it: an outside contributor, the team member who uploaded it, or the team.
  const external = m.upload_source === "invite";
  const provider = external ? m.contributor_name || m.contributor_email || "Contributor" : e.uploaded_by_name || "Your team";
  const name = e.display_name || e.original_filename;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const restricted = e.compliance_status === "RESTRICTED";

  const act = async (fn: () => Promise<unknown>, done: string, tone?: "danger") => {
    try {
      await fn();
      toast(done, { tone });
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", { tone: "danger" });
    }
  };
  const saveName = () => {
    const n = renaming?.trim();
    setRenaming(null);
    if (n && n !== name) void act(() => api(`/api/evidence/${e.id}`, { method: "PATCH", json: { display_name: n } }), "Renamed");
  };
  const usedIn = e.used_in ?? [];
  const actions: MenuItem[] = [
    { icon: "folder", label: "Add to case", onSelect: onAddToCase },
    { icon: "shield", label: checking ? "Scan in progress" : "Integrity scan", disabled: checking, onSelect: () => void act(() => api(`/api/evidence/${e.id}/integrity`, { method: "POST" }), "Integrity scan started") },
    restricted
      ? { icon: "unlock", label: "Lift restriction", onSelect: () => void act(() => api(`/api/evidence/${e.id}/compliance`, { method: "POST", json: { action: "unrestrict" } }), "Restriction lifted") }
      : { icon: "lock", label: "Restrict", onSelect: () => void act(() => api(`/api/evidence/${e.id}/compliance`, { method: "POST", json: { action: "restrict", reason: "" } }), "Evidence restricted") },
    { icon: "pencil", label: "Rename", onSelect: () => setRenaming(name) },
    { kind: "separator" },
    { icon: "trash", label: "Remove", danger: true, onSelect: () => setConfirmRemove(true) },
  ];

  if (confirmRemove)
    return (
      <li className="flex items-center gap-3 px-1 py-3">
        <p className="min-w-0 flex-1 truncate text-[13px]">
          Remove “{name}” from the vault?{usedIn.length > 0 && ` The ${usedIn.length === 1 ? "case" : `${usedIn.length} cases`} using it keep their copy.`}
        </p>
        <button onClick={() => setConfirmRemove(false)} className="h-8 rounded-lg px-3 text-[13px] hover:bg-hover">Cancel</button>
        <button onClick={() => void act(() => api(`/api/evidence/${e.id}`, { method: "DELETE" }), `Removed ${name}`, "danger")} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-medium text-white">
          Remove
        </button>
      </li>
    );

  return (
    <li className="group flex items-center gap-3 px-1 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
        <Icon name={evidenceIcon(e.evidence_type, e.original_filename)} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {renaming !== null ? (
          <input
            autoFocus
            value={renaming}
            aria-label="Name"
            onChange={(ev) => setRenaming(ev.target.value)}
            onBlur={saveName}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") saveName();
              if (ev.key === "Escape") setRenaming(null);
            }}
            className="h-7 w-full rounded-md border border-line-strong px-2 text-[13px] outline-none focus-visible:outline-none focus:border-line-strong"
          />
        ) : (
          <button onClick={onOpen} title={e.display_name ? `Original file: ${e.original_filename}` : undefined} className="block max-w-full truncate text-left text-[13px] font-medium hover:underline">
            {name}
          </button>
        )}
        <p className="truncate text-[11.5px] text-faint">
          {formatBytes(e.file_size)} · {formatDateTime(e.uploaded_at)}
          {usedIn.length > 0 && <span title={usedIn.map((u) => `${u.title.replace(/^DEMO · /, "")} (${u.reference})`).join("\n")}> · Used in {usedIn.length === 1 ? usedIn[0]!.title.replace(/^DEMO · /, "") : `${usedIn.length} cases`}</span>}
        </p>
      </div>
      {(e.processing_status === "queued" || e.processing_status === "processing") && <Chip tone="info">Processing…</Chip>}
      {e.processing_status === "failed" && <Chip tone="danger">Failed</Chip>}
      <ComplianceChip status={e.compliance_status} onOpen={onOpen} />
      {/* Who provided it, then what the integrity check found, then the actions */}
      <span
        title={`Provided by ${provider}${external ? " (contributor)" : ""}`}
        aria-label={`Provided by ${provider}`}
        className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold", external ? "bg-[#fcebd6] text-[#8a4a10]" : "bg-subtle text-muted")}
      >
        {initialsOf(provider)}
      </span>
      {/* A fixed slot, so the avatars line up whether or not a row has a finding */}
      {/* On a phone the slot shrinks to the flag alone, leaving the name its room. */}
      <span className="flex w-[160px] shrink-0 items-center max-sm:w-auto">
        {checking ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <ProgressRing size={14} /> <span className="max-sm:sr-only">Scan in progress</span>
          </span>
        ) : (
          <>
            <span className="contents max-sm:hidden">
              <IntegrityBadge report={report} review={review} onOpen={onOpen} withLabel />
            </span>
            <span className="contents sm:hidden">
              <IntegrityBadge report={report} review={review} onOpen={onOpen} />
            </span>
          </>
        )}
      </span>
      <Menu
        align="right"
        width={200}
        items={actions}
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref}
            onClick={toggle}
            aria-label={`Actions for ${name}`}
            aria-expanded={open}
            className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink", open ? "bg-hover text-ink" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
          >
            <Icon name="moreH" size={16} />
          </button>
        )}
      />
    </li>
  );
}

// Document-management sources. Each needs an OAuth app registered by an admin
// before files can sync; none are connected in this prototype.
const SOURCES = [
  { name: "iManage", logo: "imanage.png" },
  { name: "SharePoint", logo: "microsoft-365.svg" },
  { name: "Google Drive", logo: "google-drive.svg" },
  { name: "NetDocuments", logo: "netdocuments.jpg" },
];

function UploadDialog({ onClose, onFiles, onFolder }: { onClose: () => void; onFiles: (d: Declared) => void; onFolder: (d: Declared) => void }) {
  const [info, setInfo] = useState<string | null>(null);
  // Nothing is declared at upload; source and type are left for review.
  const declared: Declared = { source: "", category: "" };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Upload files">
      <div className="w-full max-w-[440px] rounded-2xl bg-panel shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <p className="text-[16px] font-semibold">Upload files</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="space-y-2 px-5 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onFiles(declared)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line text-[14px] hover:bg-subtle">
              <Icon name="upload" size={16} /> Files
            </button>
            <button onClick={() => onFolder(declared)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line text-[14px] hover:bg-subtle">
              <Icon name="folder" size={16} /> Folder
            </button>
          </div>
          <p className="pt-2 text-[11px] font-medium text-faint">Sync from</p>
          {SOURCES.map((s) => (
            <button
              key={s.name}
              onClick={() => setInfo(s.name)}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-line text-[14px] hover:bg-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/logos/${s.logo}`} alt="" className="h-5 w-5 rounded-md object-contain" />
              {s.name}
              <span className="text-[11px] text-faint">Not connected</span>
            </button>
          ))}
          {info && (
            <p className="rounded-lg bg-subtle px-3 py-2.5 text-[12px] text-muted">
              {info} isn&apos;t connected yet. Upload files or a folder instead.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4 pt-2">
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
