import { describe, expect, it, vi } from "vitest";
import { TheSportsDbFootballProvider } from "../src/thesportsdb-football-provider.js";

const fixtureResponse = {
  events: [{
    idEvent: "2501338",
    strSport: "Soccer",
    strLeague: "English League Championship",
    strTimestamp: "2026-09-19T11:30:00",
    strHomeTeam: "Millwall",
    idHomeTeam: "133634",
    strHomeTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/millwall.png",
    strAwayTeam: "West Ham United",
    idAwayTeam: "133636",
    strAwayTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/west-ham.png",
    strStatus: "NS",
    strPostponed: "no",
  }],
};

describe("TheSportsDbFootballProvider", () => {
  it("normalises West Ham's next fixture to London time and local crest endpoints", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixtureResponse), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new TheSportsDbFootballProvider(fetcher);

    await expect(provider.load(new Date("2026-09-18T12:00:00Z"))).resolves.toEqual({
      id: "2501338",
      competition: "English League Championship",
      kickoff: "2026-09-19T12:30:00+01:00",
      homeTeam: { id: "133634", name: "Millwall", crestUrl: "/api/football/crest/133634" },
      awayTeam: { id: "133636", name: "West Ham United", crestUrl: "/api/football/crest/133636" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=133636"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("proxies only a crest discovered in the validated fixture payload", async () => {
    const crestBytes = new Uint8Array([137, 80, 78, 71]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtureResponse), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(crestBytes, { status: 200, headers: { "Content-Type": "image/png", ETag: "crest-v1" } }));
    const provider = new TheSportsDbFootballProvider(fetcher);
    await provider.load(new Date("2026-09-18T12:00:00Z"));

    await expect(provider.loadCrest("133636")).resolves.toEqual({ body: Buffer.from(crestBytes), contentType: "image/png", etag: "crest-v1" });
    expect(fetcher).toHaveBeenLastCalledWith(
      new URL("https://r2.thesportsdb.com/images/media/team/badge/west-ham.png/small"),
      expect.objectContaining({ redirect: "manual", headers: { Accept: "image/png,image/jpeg,image/webp" } }),
    );
    await expect(provider.loadCrest("999999")).resolves.toBeNull();
  });
});
