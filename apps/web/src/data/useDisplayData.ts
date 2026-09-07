import { useEffect, useRef, useState } from "react";
import { displayPayloadSchema, type DisplayPayload } from "./schema";

const CACHE_KEY = "family-display:last-good:v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

export type ReadyState = { status: "ready"; payload: DisplayPayload; receivedAt: Date; stale: boolean };
export type DisplayDataState = { status: "loading" } | { status: "unavailable" } | ReadyState;

function readSnapshot(): ReadyState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const input = JSON.parse(raw) as { payload?: unknown; receivedAt?: unknown };
    const payload = displayPayloadSchema.parse(input.payload);
    const receivedAt = typeof input.receivedAt === "string" && Number.isFinite(Date.parse(input.receivedAt))
      ? new Date(input.receivedAt)
      : new Date(payload.generatedAt);
    return { status: "ready", payload, receivedAt, stale: true };
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* persistence is best effort */ }
    return null;
  }
}

function writeSnapshot(payload: DisplayPayload, receivedAt: Date) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, receivedAt: receivedAt.toISOString() }));
  } catch {
    // A valid live payload must remain usable when kiosk storage is blocked or full.
  }
}

export function useDisplayData(): DisplayDataState {
  const [state, setState] = useState<DisplayDataState>({ status: "loading" });
  const lastReady = useRef<ReadyState | null>(null);

  useEffect(() => {
    let active = true;
    const controllers = new Set<AbortController>();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
      let maintenanceCode = "DISPLAY_FETCH_FAILED";
      try {
        const response = await fetch("/api/today", { signal: controller.signal });
        if (!response.ok) {
          maintenanceCode = `DISPLAY_FETCH_${response.status}`;
          throw new Error(maintenanceCode);
        }
        let payload: DisplayPayload;
        try {
          payload = displayPayloadSchema.parse(await response.json());
        } catch {
          maintenanceCode = "DISPLAY_RESPONSE_INVALID";
          throw new Error(maintenanceCode);
        }
        if (!active) return;
        const receivedAt = new Date();
        const ready: ReadyState = {
          status: "ready",
          payload,
          receivedAt,
          stale: response.headers.get("X-Data-Stale") === "true",
        };
        writeSnapshot(payload, receivedAt);
        lastReady.current = ready;
        setState(ready);
      } catch {
        if (!active) return;
        console.warn("Family Display data unavailable", maintenanceCode);
        const fallback = lastReady.current ?? readSnapshot();
        if (fallback) {
          const stale = { ...fallback, stale: true } satisfies ReadyState;
          lastReady.current = stale;
          setState(stale);
        } else {
          setState({ status: "unavailable" });
        }
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
      }
    }

    void load().finally(() => {
      if (active) pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS);
    });

    return () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  return state;
}
