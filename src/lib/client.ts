"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = "/login";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Minimal data hook with optional polling. Results are keyed by URL so a URL change never shows stale data. */
export function useApi<T>(url: string | null, opts: { pollMs?: number | false } = {}) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      setState({ url, data: d, error: null });
    } catch (e) {
      setState((prev) => ({ url, data: prev.url === url ? prev.data : null, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!url || !opts.pollMs) return;
    const t = setInterval(() => void reload(), opts.pollMs);
    return () => clearInterval(t);
  }, [url, opts.pollMs, reload]);

  const current = state.url === url;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!url && !current, reload };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Just now", "23 mins ago", "3 hours ago", "2 days ago", then the date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Not set";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
