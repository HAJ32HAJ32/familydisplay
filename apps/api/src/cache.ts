export type CacheResult<T> = { value: T; stale: boolean };
export class RefreshCache<T> {
  private value?: T; private loadedAt = 0; private pending: Promise<CacheResult<T>> | undefined;
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  async get(loader: () => Promise<T>): Promise<CacheResult<T>> {
    if (this.value !== undefined && this.now() - this.loadedAt < this.ttlMs) return { value: this.value, stale: false };
    if (this.pending) return this.pending;
    this.pending = loader().then((value) => { this.value = value; this.loadedAt = this.now(); return { value, stale: false }; })
      .catch((error: unknown) => { if (this.value !== undefined) return { value: this.value, stale: true }; throw error; })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
