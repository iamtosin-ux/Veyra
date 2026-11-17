"use client";

import { Logo } from "@/components/Logo";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";

interface InviteInfo {
  folder: string;
  label: string;
  message: string;
  expires_at: string;
}

/** Public page behind an upload link. Contributors can add files but never see the folder's contents. */
export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statement, setStatement] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ filename: string; ok: boolean; error?: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/upload/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) setInfo(d);
        else setInvalid(d.error ?? "This upload link is invalid or has expired.");
      })
      .catch(() => setInvalid("Could not reach the server."));
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email);
    fd.append("statement", statement);
    for (const f of files) fd.append("files", f);
    const r = await fetch(`/api/upload/${token}`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setError(d.error ?? "Upload failed");
    else {
      setDone(d.results);
      setFiles([]);
      setStatement("");
    }
  };

  return (
    <main className="flex min-h-screen justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <Logo height={22} className="text-ink" />
        </div>
        <div className="rounded-2xl bg-panel p-7 shadow-[var(--shadow-card)]">
          {invalid && <p className="text-[14px] text-muted">{invalid}</p>}
          {!info && !invalid && <p className="text-[13px] text-muted">Loading…</p>}
          {info && (
            <>
              <p className="text-[12px] text-muted">Evidence request · {info.label}</p>
              <h1 className="mt-1 text-[24px] font-medium ">{info.folder}</h1>
              {info.message && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2.5 text-[13px] leading-relaxed">{info.message}</p>}

              {done ? (
                <div className="mt-6">
                  <p className="text-[14px] font-medium">Thank you. Your upload was received.</p>
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {done.map((r, i) => (
                      <li key={i} className={r.ok ? "text-ok" : "text-danger"}>
                        {r.ok ? "✓" : "✕"} {r.filename}
                        {r.error ? `: ${r.error}` : ""}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-4" onClick={() => setDone(null)}>Add more</Button>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Your name">
                      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
                    </Field>
                    <Field label="Email (optional)">
                      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} autoComplete="email" />
                    </Field>
                  </div>
                  <Field label="Files">
                    <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-xl border border-dashed border-line-strong px-4 py-6 text-[13px] text-muted hover:bg-subtle">
                      <Icon name="upload" size={18} />
                      <span className="mt-1.5">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose photos, video, audio or documents"}</span>
                    </button>
                    <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { setFiles([...files, ...(e.target.files ?? [])]); e.target.value = ""; }} />
                  </Field>
                  {files.length > 0 && (
                    <ul className="space-y-1 text-[12px]">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between rounded-md bg-subtle px-2 py-1">
                          <span className="truncate">{f.name}</span>
                          <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-faint hover:text-ink">×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Field label="Written statement (optional)">
                    <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={5} className={inputCls} />
                  </Field>
                  {error && <ErrorNote>{error}</ErrorNote>}
                  <Button variant="primary" className="w-full" disabled={busy || (!files.length && !statement.trim())} onClick={() => void submit()}>
                    {busy ? "Uploading…" : "Submit"}
                  </Button>
                  <p className="text-center text-[11px] text-faint">Link expires {formatDateTime(info.expires_at)}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
