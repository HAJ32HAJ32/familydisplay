import { useEffect, useState } from "react";

// Ticks on each minute boundary so the clock and "now" markers change together.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = new Date();
      timer = setTimeout(() => { setNow(new Date()); schedule(); }, 60_000 - (current.getTime() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

const WIDE_LAYOUT = "(min-width: 901px)";

export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => typeof window.matchMedia !== "function" || window.matchMedia(WIDE_LAYOUT).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_LAYOUT);
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}
