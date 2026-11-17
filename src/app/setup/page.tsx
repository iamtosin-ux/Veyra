"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

export default function SetupPage() {
  const [form, setForm] = useState({ organisation: "", name: "", username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Set up workspace" subtitle="Create the organisation and its first administrator. This page is available only until setup is complete.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/setup", { method: "POST", json: form });
            window.location.href = "/";
          } catch (err) {
            setError(err instanceof Error ? err.message : "Setup failed");
            setBusy(false);
          }
        }}
      >
        <Field label="Organisation name">
          <input className={inputCls} value={form.organisation} onChange={set("organisation")} required />
        </Field>
        <Field label="Your name">
          <input className={inputCls} value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Username" hint="Letters, numbers, dots, dashes or underscores.">
          <input className={inputCls} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={set("username")} required />
        </Field>
        <Field label="Password" hint="At least 5 characters (prototype only).">
          <input className={inputCls} type="password" autoComplete="new-password" minLength={5} value={form.password} onChange={set("password")} required />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button variant="primary" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthShell>
  );
}
