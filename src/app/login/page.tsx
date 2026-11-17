"use client";

import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { cx } from "@/components/ui";

const field =
  "h-12 w-full rounded-xl border border-line-strong bg-panel px-4 text-[15px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none focus-visible:outline-none";

/** Sign in with Google, or with a one-time code sent to your email. */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean; google: boolean }>("/api/auth/setup").then((r) => {
      if (r.needsSetup) window.location.href = "/setup";
      setGoogle(r.google);
    });
  }, []);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ devCode: string | null }>("/api/auth/code", { method: "POST", json: { email } });
      setDevCode(r.devCode);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a code");
    }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/code/verify", { method: "POST", json: { email, code } });
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-panel">
      <div className="px-8 pt-7">
        <Logo height={24} className="text-ink" />
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-[400px]">
          {step === "email" ? (
            <>
              <h1 className="text-[40px] leading-tight ">Sign in to Veyra</h1>
              <p className="mt-3 text-[16px] text-muted">Continue with Google, or we&apos;ll email you a code.</p>

              <button
                type="button"
                onClick={() => setNote(google ? null : "Google sign-in isn't set up for this workspace yet. Use your email instead.")}
                className="mt-9 flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-panel text-[15px] font-medium hover:bg-subtle"
              >
                <GoogleMark /> Continue with Google
              </button>
              {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}

              <div className="my-6 flex items-center gap-3 text-[12px] text-faint">
                <span className="h-px flex-1 bg-line" /> OR <span className="h-px flex-1 bg-line" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <input className={field} type="email" autoComplete="email" placeholder="Enter your email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
                <button disabled={busy || !email.trim()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {busy ? "Sending…" : "Send code"} <Icon name="arrowRight" size={17} />
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-[40px] leading-tight ">Check your email</h1>
              <p className="mt-3 text-[16px] text-muted">
                If <span className="text-ink">{email}</span> has an account, a 6-digit code is on its way.
              </p>
              {devCode && (
                <p className="mt-4 rounded-xl bg-subtle px-4 py-3 text-[13px] text-muted">
                  No email service is connected yet, so here is the code: <span className="tabular-nums text-[15px] font-semibold tracking-widest text-ink">{devCode}</span>
                </p>
              )}
              <form
                className="mt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <input
                  className={cx(field, "text-center tabular-nums text-[20px] tracking-[0.5em]")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  aria-label="Sign-in code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
                {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
                <button disabled={busy || code.length !== 6} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {busy ? "Signing in…" : "Sign in"} <Icon name="arrowRight" size={17} />
                </button>
              </form>
              <div className="mt-5 flex justify-between text-[13px] text-muted">
                <button
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  className="hover:text-ink"
                >
                  Use a different email
                </button>
                <button onClick={() => void sendCode()} disabled={busy} className="hover:text-ink">
                  Send a new code
                </button>
              </div>
            </>
          )}
          <p className="mt-8 text-[13px] text-faint">By continuing, you agree to use only material you are authorised to handle.</p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
