const RELOAD_KEY = "family-display:last-daily-reload:v1";
const TIMEZONE = "Europe/London";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type SchedulerOptions = {
  now?: () => Date;
  reload?: () => void;
  storage?: StorageLike;
  setTimer?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

type LocalParts = { date: string; hour: number; minute: number };

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function delayUntilReload(now: Date, lastReloadDate: string | null) {
  const current = localParts(now);
  const withinWindow = current.hour === 3 && current.minute <= 15;
  if (withinWindow && current.date !== lastReloadDate) return 0;

  const firstMinute = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  for (let index = 0; index < 27 * 60; index += 1) {
    const candidate = new Date(firstMinute + index * 60_000);
    const local = localParts(candidate);
    if (local.hour === 3 && local.minute === 5 && local.date !== lastReloadDate) {
      return candidate.getTime() - now.getTime();
    }
  }
  throw new Error("Unable to schedule daily reload");
}

export function scheduleDailyReload(options: SchedulerOptions = {}) {
  const now = options.now ?? (() => new Date());
  const reload = options.reload ?? (() => window.location.reload());
  const storage = options.storage ?? localStorage;
  const setTimer = options.setTimer ?? ((handler, timeout) => setTimeout(handler, timeout));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const startedAt = now();
  const delay = delayUntilReload(startedAt, storage.getItem(RELOAD_KEY));

  const timer = setTimer(() => {
    storage.setItem(RELOAD_KEY, localParts(new Date(startedAt.getTime() + delay)).date);
    reload();
  }, delay);

  return () => clearTimer(timer);
}
