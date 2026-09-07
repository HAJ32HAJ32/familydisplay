export type CacheResult<T> = { value: T; stale: boolean };
type CacheEntry<T> = { key: string; value?: T; loadedAt: number; pending: Promise<CacheResult<T>> | undefined };
export class RefreshCache<T> {
  private entry?: CacheEntry<T>;
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  async get(loader: () => Promise<T>, key = "default"): Promise<CacheResult<T>> {
    const entry = this.entry?.key === key ? this.entry : { key, loadedAt: 0, pending: undefined };
    this.entry = entry;
    if (entry.value !== undefined && this.now() - entry.loadedAt < this.ttlMs) return { value: entry.value, stale: false };
    if (entry.pending) return entry.pending;
    const pending = loader().then((value) => { entry.value = value; entry.loadedAt = this.now(); return { value, stale: false }; })
      .catch((error: unknown) => { if (entry.value !== undefined) return { value: entry.value, stale: true }; throw error; })
      .finally(() => { if (entry.pending === pending) entry.pending = undefined; });
    entry.pending = pending;
    return pending;
  }
}
