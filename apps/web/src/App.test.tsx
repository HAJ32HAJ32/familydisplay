import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { scheduleDailyReload } from "./data/dailyReload";
import { payload } from "./test/fixture";

vi.mock("./data/dailyReload", () => ({ scheduleDailyReload: vi.fn(() => vi.fn()) }));

const response = (body: unknown, stale = false) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Data-Stale": String(stale) },
  });

describe("Family Display", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves from its dark loading shell to the complete display", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));

    const { container } = render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading family calendar");
    expect(container.firstElementChild).toHaveClass("app-shell");

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Yesterday · Wed 26 August" })).toBeVisible();
    expect(screen.getAllByTestId("future-day")).toHaveLength(6);
    expect(screen.getByText("Updated 18:42")).toBeVisible();
  });

  it("renders a valid browser snapshot as stale on an offline cold start", async () => {
    localStorage.setItem("family-display:last-good:v1", JSON.stringify({ payload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("atomically replaces the board when a background poll succeeds", async () => {
    vi.useFakeTimers();
    const refreshed = {
      ...payload,
      generatedAt: "2026-08-27T18:47:00+01:00",
      days: payload.days.map((day, index) => index === 0
        ? { ...day, events: [{ ...day.events[0]!, id: "evt_changed", title: "Calendar refreshed" }] }
        : day),
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response(refreshed));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Everyone: Family day, at Home")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Everyone: Family day, at Home")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Everyone: Calendar refreshed, at Home")).toBeVisible();
    expect(screen.getByText("Updated 18:47")).toBeVisible();
  });

  it("keeps the last render and marks it stale when a background poll fails", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("rejects an invalid poll payload without blanking the valid board", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response({ ...payload, days: payload.days.slice(0, 6) }));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("times out a stalled cold-start request into the safe retrying state", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));

    render(<App />);
    expect(screen.getByText("Loading family calendar")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(screen.getByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
  });

  it("renders event semantics and all five groups without relying on colour", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    expect(await screen.findByLabelText("H and Chantele: Date night")).toBeVisible();
    expect(screen.getByLabelText("Everyone: Family day, at Home")).toHaveTextContent("All day");
    expect(screen.getByLabelText("Rafe: Nursery drop-off, at Nursery")).toHaveTextContent("08:30");
    expect(screen.getByLabelText("H: Bins out")).toBeVisible();
    expect(screen.getByLabelText("Chantele: Appointment, at Clinic")).toBeVisible();
    expect(screen.getAllByText("Nothing planned")).toHaveLength(4);
    expect(screen.getByLabelText(/Maximum 19 degrees Celsius/)).toBeVisible();
    expect(screen.queryByLabelText(/Maximum 21 degrees Celsius/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks a successful server-declared stale response without hiding the board", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload, true));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("shows the safe retrying state when live and cached data are unusable", async () => {
    localStorage.setItem("family-display:last-good:v1", "{\"payload\":\"invalid\"}");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("service detail", { status: 503 }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Trying again…");
    expect(screen.queryByText("service detail")).not.toBeInTheDocument();
    expect(localStorage.getItem("family-display:last-good:v1")).toBeNull();
  });

  it("starts and cleans up daily browser recovery scheduling", () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => undefined));
    const cancel = vi.fn();
    vi.mocked(scheduleDailyReload).mockReturnValueOnce(cancel);

    const { unmount } = render(<App />);
    expect(scheduleDailyReload).toHaveBeenCalledOnce();

    unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
