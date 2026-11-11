import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrainData } from "./useTrainData";

const payload = {
  generatedAt: "2026-11-11T08:00:00Z",
  source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
  main: {
    crs: "UWL",
    station: "Upper Warlingham",
    state: "available",
    checkedAt: "2026-11-11T08:00:00Z",
    departures: [{ destination: "London Victoria", scheduledTime: "08:02", expectedTime: null, status: "on-time" }],
  },
  rotating: [
    { crs: "CDS", station: "Coulsdon South", state: "empty", checkedAt: "2026-11-11T08:00:00Z", departures: [] },
    { crs: "WHY", station: "Whyteleafe", state: "unavailable", checkedAt: "2026-11-11T08:00:00Z", departures: [] },
  ],
};

const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useTrainData", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls the independent endpoint every minute", async () => {
    vi.mocked(fetch).mockImplementation(async () => response(payload));
    const { result } = renderHook(() => useTrainData());

    await flush();
    expect(result.current.status).toBe("ready");
    expect(fetch).toHaveBeenCalledWith("/api/trains", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails closed instead of retaining a previous live travel board", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockRejectedValueOnce(new TypeError("offline"));
    const { result } = renderHook(() => useTrainData());
    await flush();
    expect(result.current.status).toBe("ready");

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(result.current).toEqual({ status: "unavailable" });
    expect(localStorage.length).toBe(0);
  });

  it("rejects malformed payloads and times out stalled requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, main: { ...payload.main, station: "Wrong station" } }));
    const malformed = renderHook(() => useTrainData());
    await flush();
    expect(malformed.result.current.status).toBe("unavailable");
    malformed.unmount();

    vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const stalled = renderHook(() => useTrainData());
    await act(async () => { await vi.advanceTimersByTimeAsync(8_001); });
    expect(stalled.result.current).toEqual({ status: "loading" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_999); });
    expect(stalled.result.current).toEqual({ status: "unavailable" });
  });
});
