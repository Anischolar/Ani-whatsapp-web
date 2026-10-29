"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) {
    // Session expired: a full reload to the login page also discards any stale client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

/** Fetches JSON from `url` (null = skip) and optionally re-polls every `intervalMs`. */
type ApiState<T> = { loadedUrl: string | null; data: T | null; error: string | null };

/** Fetches JSON from `url` (null = skip) and optionally re-polls every `intervalMs`. */
export function useApi<T>(url: string | null, intervalMs?: number) {
  const [state, setState] = useState<ApiState<T>>({ loadedUrl: null, data: null, error: null });
  const latestUrl = useRef(url);
  useEffect(() => {
    latestUrl.current = url;
  }, [url]);

  const load = useCallback(async (target: string) => {
    try {
      const data = await api<T>(target);
      // Ignore responses for a URL we've since navigated away from (e.g. an older page of results).
      if (latestUrl.current === target) setState({ loadedUrl: target, data, error: null });
    } catch (e) {
      if (latestUrl.current === target) setState((s) => ({ ...s, loadedUrl: target, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    void load(url);
    if (!intervalMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load(url);
    }, intervalMs);
    return () => clearInterval(t);
  }, [url, intervalMs, load]);

  const reload = useCallback(() => (url ? load(url) : Promise.resolve()), [url, load]);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);

  return { data: state.data, error: state.error, loading: !!url && state.loadedUrl !== url, reload, setData };
}

export function formatDate(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
