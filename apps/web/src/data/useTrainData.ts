import { useEffect, useState } from "react";
import { trainPayloadSchema, type TrainPayload } from "./schema";

const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type TrainDataState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; payload: TrainPayload };

export function useTrainData(): TrainDataState {
  const [state, setState] = useState<TrainDataState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const controllers = new Set<AbortController>();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch("/api/trains", { signal: controller.signal });
        if (!response.ok) throw new Error("status");
        const payload = trainPayloadSchema.parse(await response.json());
        if (active) setState({ status: "ready", payload });
      } catch {
        if (active) setState({ status: "unavailable" });
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
