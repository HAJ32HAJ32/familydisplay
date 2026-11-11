import { trainPayloadSchema, type TrainDeparture, type TrainPayload, type TrainStationBoard } from "@family-display/contract";

const DEFAULT_TTL_MS = 45_000;

const stations = [
  { crs: "UWL", station: "Upper Warlingham" },
  { crs: "CDS", station: "Coulsdon South" },
  { crs: "WHY", station: "Whyteleafe" },
] as const;

type Station = typeof stations[number];

export interface TrainProvider {
  load(crs: Station["crs"], station: Station["station"]): Promise<TrainDeparture[]>;
}

export class TrainService {
  private cached?: { payload: TrainPayload; loadedAt: number };
  private pending: Promise<TrainPayload> | undefined;

  constructor(
    private readonly provider: TrainProvider,
    private readonly options: {
      ttlMs?: number;
      clock?: () => Date;
      now?: () => number;
    } = {},
  ) {}

  private async refresh() {
    const results = await Promise.allSettled(stations.map(({ crs, station }) => this.provider.load(crs, station)));
    const checkedAt = (this.options.clock ?? (() => new Date()))().toISOString();
    const boards = stations.map(({ crs, station }, index): TrainStationBoard => {
      const result = results[index]!;
      if (result.status === "rejected") return { crs, station, state: "unavailable", checkedAt, departures: [] } as TrainStationBoard;
      if (result.value.length === 0) return { crs, station, state: "empty", checkedAt, departures: [] } as TrainStationBoard;
      return { crs, station, state: "available", checkedAt, departures: result.value.slice(0, 3) } as TrainStationBoard;
    });
    return trainPayloadSchema.parse({
      generatedAt: checkedAt,
      source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
      main: boards[0],
      rotating: [boards[1], boards[2]],
    });
  }

  async getDepartures() {
    const now = (this.options.now ?? Date.now)();
    const ttlMs = this.options.ttlMs ?? DEFAULT_TTL_MS;
    if (this.cached && now - this.cached.loadedAt < ttlMs) return this.cached.payload;
    if (this.pending) return this.pending;
    const pending = this.refresh()
      .then((payload) => {
        this.cached = { payload, loadedAt: (this.options.now ?? Date.now)() };
        return payload;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }
}
