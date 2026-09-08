import { useEffect } from "react";
import type { Meal, MorningQuote } from "@family-display/contract";
import type { DisplayDay, DisplayPayload, EventOccurrence } from "./data/schema";
import { scheduleDailyReload } from "./data/dailyReload";
import { useDisplayData } from "./data/useDisplayData";
import { MealIcon, OutfitIcon, WeatherIcon } from "./icons";

const groupLabels: Record<EventOccurrence["group"], { short: string; accessible: string }> = {
  "h-and-chantele": { short: "H + C", accessible: "H and Chantele" },
  all: { short: "All", accessible: "Everyone" },
  rafe: { short: "R", accessible: "Rafe" },
  h: { short: "H", accessible: "H" },
  chantele: { short: "C", accessible: "Chantele" },
  household: { short: "Household", accessible: "Household" },
};

const fullWeekdays: Record<DisplayDay["weekday"], string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const conditionLabels = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  showers: "Showers",
  thunderstorm: "Thunderstorm",
} as const;

const outfitLabels = {
  tshirt: "T-shirt",
  "long-sleeve": "Long sleeve",
  hoodie: "Hoodie",
  coat: "Coat",
  raincoat: "Raincoat",
} as const;

function datePart(date: string, timezone: string, part: "day" | "month") {
  return new Intl.DateTimeFormat("en-GB", part === "day"
    ? { day: "2-digit", timeZone: timezone }
    : { month: "long", timeZone: timezone })
    .format(new Date(`${date}T12:00:00Z`));
}

function longDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: timezone })
    .format(new Date(`${date}T12:00:00Z`));
}

function eventTime(event: EventOccurrence, timezone: string) {
  if (event.allDay) return "All day";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone })
    .format(new Date(event.start));
}

function Events({ events, timezone, compact = false }: { events: EventOccurrence[]; timezone: string; compact?: boolean }) {
  if (events.length === 0) return <p className="empty-day">Nothing planned</p>;
  const capacity = compact ? 2 : 4;
  const visibleCount = events.length > capacity ? capacity - 1 : events.length;
  const visibleEvents = events.slice(0, visibleCount);
  const hiddenCount = events.length - visibleCount;
  return (
    <ul className={`event-list${compact ? " event-list--compact" : ""}`}>
      {visibleEvents.map((event) => {
        const displayedTime = eventTime(event, timezone);
        const accessibleLabel = `${groupLabels[event.group].accessible}: ${event.title}, ${displayedTime}${event.location ? `, at ${event.location}` : ""}`;
        return (
          <li className={`event event--${event.group}`} key={event.id} aria-label={accessibleLabel}>
            <time className="event__time">{displayedTime}</time>
            <span className="event__body">
              <strong className="event__title" title={event.title}>{event.title}</strong>
              {event.location && <span className="event__location" title={event.location}>{event.location}</span>}
            </span>
            <span className="event__group" aria-hidden="true">{groupLabels[event.group].short}</span>
          </li>
        );
      })}
      {hiddenCount > 0 && <li className="event-overflow" aria-label={`${hiddenCount} more events`}>+{hiddenCount} more</li>}
    </ul>
  );
}

function Weather({ day, compact = false }: { day: DisplayDay; compact?: boolean }) {
  if (!day.weather) return <div className="weather weather--missing">Forecast unavailable</div>;
  const { weather } = day;
  const label = `${fullWeekdays[day.weekday]} weather: ${conditionLabels[weather.condition]}, maximum ${weather.tempMaxC} degrees Celsius, ${weather.precipitationChance}% chance of rain`;
  return (
    <div className={`weather${compact ? " weather--compact" : ""}`} aria-label={label}>
      <WeatherIcon condition={weather.condition} />
      <div className="weather__reading">
        <strong>{weather.tempMaxC}°</strong>
        <span>{conditionLabels[weather.condition]} · {weather.precipitationChance}%</span>
      </div>
      <div className="outfit">
        <OutfitIcon outfit={weather.outfit} />
        <span>{outfitLabels[weather.outfit]}</span>
      </div>
    </div>
  );
}

function mealText(meal: Meal) {
  if (meal.type === "recipe") return meal.title;
  if (meal.type === "takeaway") return "Takeaway";
  return "Eating out";
}

function MealSummary({ meal, today = false }: { meal: Meal | null; today?: boolean }) {
  if (!meal) return (
    <div className={`meal${today ? " meal--today" : ""} meal--empty`} aria-label={today ? "Tonight's meal not planned" : "Meal not planned"}>
      <span className="eyebrow">{today ? "Tonight’s meal" : "Dinner"}</span>
      <span>Dinner not set</span>
    </div>
  );
  const text = mealText(meal);
  return (
    <div className={`meal${today ? " meal--today" : ""}`} aria-label={today ? `Tonight's meal: ${text}` : `Meal: ${text}`}>
      <MealIcon type={meal.type} />
      <div>
        <span className="eyebrow">{today ? "Tonight’s meal" : "Dinner"}</span>
        <strong title={text}>{text}</strong>
      </div>
    </div>
  );
}

function MorningQuoteSummary({ quote }: { quote: MorningQuote }) {
  return (
    <blockquote className="morning-quote" aria-label="Morning quote">
      <p>“{quote.text}”</p>
      <cite>— {quote.attribution}</cite>
    </blockquote>
  );
}

function TodayCard({ day, timezone, morningQuote }: { day: DisplayDay; timezone: string; morningQuote: MorningQuote | null }) {
  return (
    <section className="today-card">
      <div className="today-card__date">
        <h2 aria-label={`Today · ${day.weekday} ${longDate(day.date, timezone)}`}>
          <span className="today-card__weekday">{fullWeekdays[day.weekday]}</span>
          <span className="today-card__number">{datePart(day.date, timezone, "day")}</span>
          <span className="today-card__month">{datePart(day.date, timezone, "month")}</span>
        </h2>
        <Weather day={day} />
      </div>
      <div className="today-card__schedule">
        <p className="eyebrow">Schedule for today</p>
        <Events events={day.events} timezone={timezone} />
      </div>
      <div className="today-card__aside">
        <MealSummary meal={day.meal} today />
        {morningQuote && <MorningQuoteSummary quote={morningQuote} />}
      </div>
    </section>
  );
}

function FutureDay({ day, timezone }: { day: DisplayDay; timezone: string }) {
  return (
    <section className="future-day" data-testid="future-day">
      <div className="future-day__summary">
        <h2>
          <span>{day.weekday}</span>
          <strong>{datePart(day.date, timezone, "day")}</strong>
        </h2>
        <Weather day={day} compact />
        <MealSummary meal={day.meal} />
      </div>
      <Events events={day.events} timezone={timezone} compact />
    </section>
  );
}

function Freshness({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: payload.timezone })
    .format(new Date(payload.generatedAt));
  return <p className={`freshness${stale ? " freshness--stale" : ""}`}>{stale ? `Last updated ${time} · offline` : `Updated ${time}`}</p>;
}

const colourGuide = [
  { googleColour: "Grape", group: "H + Chantele", className: "grape" },
  { googleColour: "Blueberry", group: "All", className: "blueberry" },
  { googleColour: "Basil", group: "Rafe", className: "basil" },
  { googleColour: "Graphite", group: "H", className: "graphite" },
  { googleColour: "Banana", group: "Chantele", className: "banana" },
  { googleColour: "Tangerine", group: "Household", className: "tangerine" },
] as const;

function ColourGuide({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  return (
    <footer className="colour-guide" aria-label="Google Calendar colour guide">
      <div className="colour-guide__items">
        {colourGuide.map((item) => (
          <span className="colour-guide__item" key={item.googleColour}>
            <span className={`colour-guide__swatch colour-guide__swatch--${item.className}`} aria-hidden="true" />
            <span>{item.googleColour} <strong>{item.group}</strong></span>
          </span>
        ))}
      </div>
      <Freshness payload={payload} stale={stale} />
    </footer>
  );
}

function YesterdayPanel({ payload }: { payload: DisplayPayload }) {
  return (
    <aside className="yesterday-panel">
      <p className="eyebrow">Previous day</p>
      <h2>Yesterday · {payload.yesterday.weekday} {longDate(payload.yesterday.date, payload.timezone)}</h2>
      <Events events={payload.yesterday.events} timezone={payload.timezone} compact />
    </aside>
  );
}

function DisplayBoard({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  return (
    <main className="display-board">
      <div className="top-row">
        <TodayCard day={payload.days[0]!} timezone={payload.timezone} morningQuote={payload.morningQuote} />
        <YesterdayPanel payload={payload} />
      </div>
      <div className="future-grid">
        {payload.days.slice(1).map((day) => <FutureDay day={day} timezone={payload.timezone} key={day.date} />)}
      </div>
      <ColourGuide payload={payload} stale={stale} />
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
