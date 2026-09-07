import { describe, expect, it, vi } from "vitest";
import { scheduleDailyReload } from "./dailyReload";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
  };
}

describe("scheduleDailyReload", () => {
  it("reloads once at 03:05 Europe/London and records the local date first", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const setTimer = vi.fn((callback: () => void) => { callback(); return 1 as unknown as ReturnType<typeof setTimeout>; });

    const cancel = scheduleDailyReload({
      now: () => new Date("2026-08-27T01:00:00Z"),
      reload,
      storage,
      setTimer,
      clearTimer: vi.fn(),
    });

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 65 * 60 * 1000);
    expect(storage.setItem).toHaveBeenCalledWith("family-display:last-daily-reload:v1", "2026-08-27");
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]!);
    expect(reload).toHaveBeenCalledOnce();
    cancel();
  });

  it("does not schedule another reload on the same local date", () => {
    const storage = memoryStorage("2026-08-27");
    const setTimer = vi.fn((_callback: () => void, _timeout: number) => 1 as unknown as ReturnType<typeof setTimeout>);

    scheduleDailyReload({
      now: () => new Date("2026-08-27T02:06:00Z"),
      reload: vi.fn(),
      storage,
      setTimer,
      clearTimer: vi.fn(),
    });

    expect(setTimer.mock.calls[0]![1]).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("continues scheduling when the reload marker cannot be read", () => {
    const storage = {
      getItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
      setItem: vi.fn(),
    };
    const setTimer = vi.fn((_callback: () => void, _timeout: number) => 1 as unknown as ReturnType<typeof setTimeout>);

    expect(() => scheduleDailyReload({
      now: () => new Date("2026-08-27T01:00:00Z"),
      reload: vi.fn(),
      storage,
      setTimer,
      clearTimer: vi.fn(),
    })).not.toThrow();
    expect(setTimer).toHaveBeenCalledOnce();
  });

  it("still reloads when the reload marker cannot be written", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new DOMException("full", "QuotaExceededError"); }),
    };
    const reload = vi.fn();
    const setTimer = vi.fn((callback: () => void) => { callback(); return 1 as unknown as ReturnType<typeof setTimeout>; });

    expect(() => scheduleDailyReload({
      now: () => new Date("2026-08-27T01:00:00Z"),
      reload,
      storage,
      setTimer,
      clearTimer: vi.fn(),
    })).not.toThrow();
    expect(reload).toHaveBeenCalledOnce();
  });
});
