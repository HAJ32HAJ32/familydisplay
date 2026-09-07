import { useEffect } from "react";
import type { DisplayDay, DisplayPayload, EventOccurrence } from "./data/schema";
import { scheduleDailyReload } from "./data/dailyReload";
import { useDisplayData } from "./data/useDisplayData";

const groupLabels: Record<EventOccurrence["group"], { short: string; accessible: string }> = {
  "h-and-chantele": { short: "H + C", accessible: "H and Chantele" },
  all: { short: "All", accessible: "Everyone" },
  rafe: { short: "Rafe", accessible: "Rafe" },
  h: { short: "H", accessible: "H" },
  chantele: { short: "Chantele", accessible: "Chantele" },
  household: { short: "Household", accessible: "Household" },
};

function longDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: timezone })
    .format(new Date(`${date}T12:00:00Z`));
}

function eventTime(event: EventOccurrence, timezone: string) {
  if (event.allDay) return "All day";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone })
    .format(new Date(event.start));
}

function Events({ events, timezone }: { events: EventOccurrence[]; timezone: string }) {
  if (events.length === 0) return <p className="empty-day">Nothing planned</p>;
  return (
    <ul className="event-list">
      {events.map((event) => {
        const accessibleLabel = `${groupLabels[event.group].accessible}: ${event.title}${event.location ? `, at ${event.location}` : ""}`;
        return (
          <li className={`event event--${event.group}`} key={event.id} aria-label={accessibleLabel}>
            <span className="event__marker" aria-hidden="true" />
            <time className="event__time">{eventTime(event, timezone)}</time>
            <span className="event__body">
              <span className="event__title" title={event.title}>{event.title}</span>
              {event.location && <span className="event__location" title={event.location}>{event.location}</span>}
            </span>
            <span className="event__group">{groupLabels[event.group].short}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Day({ day, timezone, variant, testId }: { day: DisplayDay; timezone: string; variant: "today" | "future"; testId?: string }) {
  const prefix = variant === "today" ? "Today · " : "";
  return (
    <section className={`day-card day-card--${variant}`} data-testid={testId}>
      <header className="day-card__header">
        <h2>{prefix}{day.weekday} {longDate(day.date, timezone)}</h2>
        {variant === "today" && day.weather && (
          <div className="weather" aria-label={`Maximum ${day.weather.tempMaxC} degrees Celsius, ${day.weather.precipitationChance}% chance of rain, ${day.weather.outfit}`}>
            <strong>{day.weather.tempMaxC}°</strong>
            <span>{day.weather.precipitationChance}% rain</span>
            <span className="outfit">{day.weather.outfit.replace("-", " ")}</span>
          </div>
        )}
      </header>
      <Events events={day.events} timezone={timezone} />
    </section>
  );
}

function Freshness({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: payload.timezone })
    .format(new Date(payload.generatedAt));
  return <p className={`freshness${stale ? " freshness--stale" : ""}`}>{stale ? `Last updated ${time} · offline` : `Updated ${time}`}</p>;
}

function DisplayBoard({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  return (
    <main className="display-board">
      <section className="yesterday-panel">
        <h2>Yesterday · {payload.yesterday.weekday} {longDate(payload.yesterday.date, payload.timezone)}</h2>
        <Events events={payload.yesterday.events} timezone={payload.timezone} />
      </section>
      <Day day={payload.days[0]!} timezone={payload.timezone} variant="today" />
      <div className="future-grid">
        {payload.days.slice(1).map((day) => <Day day={day} timezone={payload.timezone} variant="future" testId="future-day" key={day.date} />)}
      </div>
      <Freshness payload={payload} stale={stale} />
    </main>
  );
}

export function App() {
  const state = useDisplayData();
  useEffect(() => {
    const cancel = scheduleDailyReload();
    return cancel;
  }, []);

  if (state.status === "loading") return (
    <main className="app-shell app-shell--loading">
      <div className="loading-grid" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <p role="status">Loading family calendar</p>
    </main>
  );
  if (state.status === "unavailable") return <main className="app-shell app-shell--unavailable"><h1>Calendar temporarily unavailable</h1><p role="status">Trying again…</p></main>;
  return <div className="app-shell"><DisplayBoard payload={state.payload} stale={state.stale} /></div>;
}
