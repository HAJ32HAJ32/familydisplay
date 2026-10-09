import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BinReminder, Countdown, FootballMatch, Meal, MorningQuote, MultiDayEvent } from "@family-display/contract";
import type { DisplayDay, DisplayPayload, EventOccurrence } from "./data/schema";
import { scheduleDailyReload } from "./data/dailyReload";
import { useDisplayData } from "./data/useDisplayData";
import { useNow, useWideLayout } from "./data/useNow";
import { BinIcon, DetailIcon, MealIcon, OutfitIcon, WeatherIcon } from "./icons";

const groupLabels: Record<EventOccurrence["group"], { short: string; accessible: string }> = {
  "h-and-chantele": { short: "H + C", accessible: "H and Chantele" },
  all: { short: "All", accessible: "Everyone" },
  rafe: { short: "R", accessible: "Rafe" },
  h: { short: "H", accessible: "H" },
  chantele: { short: "C", accessible: "Chantele" },
  household: { short: "Home", accessible: "Home" },
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

// Hide the board's age warning until the calendar has been out of date for an hour.
const STALE_ALERT_MS = 60 * 60 * 1000;

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

function shortDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone })
    .format(new Date(`${date}T12:00:00Z`));
}

function clockTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(date);
}

function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(date);
}

function eventTime(event: EventOccurrence, timezone: string) {
  if (event.allDay) return "All day";
  return clockTime(new Date(event.start), timezone);
}

type EventNote = { status?: "now" | "next"; until?: { short: string; long: string } };

function Events({ events, timezone, compact = false, adaptive = false, notes, emptyText = "Nothing planned" }: { events: EventOccurrence[]; timezone: string; compact?: boolean; adaptive?: boolean; notes?: Map<string, EventNote>; emptyText?: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const eventsSignature = JSON.stringify([events, notes ? [...notes] : null]);
  const [measurement, setMeasurement] = useState<{ signature: string; count: number | null }>({ signature: eventsSignature, count: null });
  const measuredCount = measurement.signature === eventsSignature ? measurement.count : null;

  useLayoutEffect(() => {
    if (!adaptive || measuredCount !== null || events.length === 0 || !listRef.current) return;
    const list = listRef.current;
    const viewportHeight = Math.max(0, window.innerHeight - list.getBoundingClientRect().top);
    const availableHeight = Math.min(list.clientHeight, viewportHeight);
    if (availableHeight <= 0) {
      setMeasurement({ signature: eventsSignature, count: events.length });
      return;
    }

    const eventHeights = Array.from(list.children)
      .filter((child) => child.classList.contains("event"))
      .map((event) => Math.max(event.scrollHeight, event.getBoundingClientRect().height));
    const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 8;
    const eventsHeight = eventHeights.reduce((total, height) => total + height, 0) + gap * Math.max(0, eventHeights.length - 1);
    if (eventsHeight <= availableHeight) {
      setMeasurement({ signature: eventsSignature, count: events.length });
      return;
    }

    const overflowProbe = document.createElement("li");
    overflowProbe.className = "event-overflow event-overflow--measure";
    overflowProbe.textContent = `+${events.length} more`;
    list.append(overflowProbe);
    const overflowHeight = overflowProbe.getBoundingClientRect().height || 32;
    overflowProbe.remove();

    let count = 0;
    let usedHeight = overflowHeight;
    for (const height of eventHeights) {
      const nextHeight = usedHeight + gap + height;
      if (nextHeight > availableHeight) break;
      usedHeight = nextHeight;
      count += 1;
    }
    setMeasurement({ signature: eventsSignature, count });
  }, [adaptive, events.length, eventsSignature, measuredCount]);

  useEffect(() => {
    if (!adaptive || !listRef.current) return;
    const requestMeasurement = () => setMeasurement({ signature: eventsSignature, count: null });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestMeasurement);
    observer?.observe(listRef.current);
    window.addEventListener("resize", requestMeasurement);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", requestMeasurement);
    };
  }, [adaptive, eventsSignature]);

  if (events.length === 0) return <p className="empty-day">{emptyText}</p>;
  const visibleCount = adaptive ? measuredCount ?? events.length : Math.min(events.length, compact ? 1 : 3);
  const visibleEvents = events.slice(0, visibleCount);
  const hiddenCount = events.length - visibleCount;
  return (
    <ul ref={listRef} data-visible-events={visibleCount} className={`event-list${compact ? " event-list--compact" : ""}${adaptive ? " event-list--adaptive" : ""}`}>
      {visibleEvents.map((event) => {
        const note = notes?.get(event.id);
        const displayedTime = note?.until ? `Until ${note.until.short}` : eventTime(event, timezone);
        const spokenTime = note?.until ? `until ${note.until.long}` : displayedTime;
        const spokenStatus = note?.status === "now" ? ", happening now" : note?.status === "next" ? ", up next" : "";
        const accessibleLabel = `${groupLabels[event.group].accessible}: ${event.title}, ${spokenTime}${event.location ? `, at ${event.location}` : ""}${spokenStatus}`;
        const showsWhen = !(compact && event.allDay && !note?.until);
        return (
          <li className={`event event--${event.group}${event.allDay ? " event--all-day" : ""}${note?.status ? ` event--${note.status}` : ""}`} key={event.id} aria-label={accessibleLabel}>
            {showsWhen && (
              <span className="event__when" aria-hidden="true">
                {event.allDay || note?.until
                  ? <span className="event__time event__time--all-day">{displayedTime}</span>
                  : <time className="event__time" dateTime={event.start}>{displayedTime}</time>}
                {note?.status && <span className="event__status">{note.status === "now" ? "Now" : "Next"}</span>}
              </span>
            )}
            <span className="event__body">
              <strong className="event__title" title={event.title}>{event.title}</strong>
              {event.location && <span className="event__location" title={event.location}>{event.location}</span>}
            </span>
            <span className="event__group" aria-hidden="true">{groupLabels[event.group].short}</span>
          </li>
        );
      })}
      {hiddenCount > 0 && (
        <li className="event-overflow" aria-label={`${hiddenCount} ${visibleCount === 0 ? "" : "more "}event${hiddenCount === 1 ? "" : "s"}`}>
          {visibleCount === 0 ? `${hiddenCount} event${hiddenCount === 1 ? "" : "s"}` : `+${hiddenCount} more`}
        </li>
      )}
    </ul>
  );
}

function Temperatures({ max, min }: { max: number; min: number | null }) {
  return (
    <span className="weather__temps">
      <strong>{max}°</strong>
      {min !== null && <span className="weather__low">{min}°</span>}
    </span>
  );
}

function weatherLabel(day: DisplayDay, rainText: string | null) {
  const weather = day.weather!;
  return [
    `${fullWeekdays[day.weekday]} weather: ${conditionLabels[weather.condition]}, maximum ${weather.tempMaxC} degrees Celsius`,
    weather.tempMinC !== null ? `, minimum ${weather.tempMinC} degrees` : "",
    `, ${weather.precipitationChance}% chance of rain`,
    rainText ? `, ${rainText.toLowerCase()}` : "",
    weather.sunrise ? `, sunrise ${weather.sunrise}` : "",
    weather.sunset ? `, sunset ${weather.sunset}` : "",
  ].join("");
}

function Outfit({ outfit, today = false }: { outfit: NonNullable<DisplayDay["weather"]>["outfit"]; today?: boolean }) {
  return (
    <div className={`outfit${today ? " outfit--today" : ""}`}>
      <OutfitIcon outfit={outfit} />
      <span>{outfitLabels[outfit]}</span>
    </div>
  );
}

function Weather({ day }: { day: DisplayDay }) {
  if (!day.weather) return <div className="weather weather--missing">Forecast unavailable</div>;
  const { weather } = day;
  return (
    <div className="weather weather--compact" aria-label={weatherLabel(day, null)}>
      <WeatherIcon condition={weather.condition} />
      <div className="weather__reading">
        <Temperatures max={weather.tempMaxC} min={weather.tempMinC} />
        <span className="weather__condition">{conditionLabels[weather.condition]} · {weather.precipitationChance}%</span>
      </div>
      <Outfit outfit={weather.outfit} />
    </div>
  );
}

// Today's weather is one centred stack so every line shares the same axis.
function TodayWeather({ day, now, timezone }: { day: DisplayDay; now: Date; timezone: string }) {
  if (!day.weather) return <div className="weather weather--today weather--missing">Forecast unavailable</div>;
  const { weather } = day;
  const rainingNow = Boolean(weather.rainFrom && weather.rainFrom <= clockTime(now, timezone));
  const rainText = weather.rainFrom ? rainingNow ? "Rain now" : `Rain from ${weather.rainFrom}` : null;
  return (
    <div className="weather weather--today" aria-label={weatherLabel(day, rainText)}>
      <div className="weather__headline">
        <WeatherIcon condition={weather.condition} />
        <Temperatures max={weather.tempMaxC} min={weather.tempMinC} />
      </div>
      <span className="weather__condition">{conditionLabels[weather.condition]} · {weather.precipitationChance}%</span>
      {(rainText || weather.sunrise || weather.sunset) && (
        <ul className="weather__details" aria-hidden="true">
          {rainText && <li className="weather__detail weather__detail--rain"><DetailIcon kind="rain" /><span>{rainText}</span></li>}
          {(weather.sunrise || weather.sunset) && (
            <li className="weather__detail weather__detail--sun">
              {weather.sunrise && <span><DetailIcon kind="sunrise" />{weather.sunrise}</span>}
              {weather.sunset && <span><DetailIcon kind="sunset" />{weather.sunset}</span>}
            </li>
          )}
        </ul>
      )}
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
      <div>
        <span className="eyebrow">{today ? "Tonight’s meal" : "Dinner"}</span>
        <span className="meal__value">Dinner not set</span>
      </div>
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
      <p aria-label={`Quote: ${quote.text}`} title={quote.text}>“{quote.text}”</p>
      <cite aria-label={`Attribution: ${quote.attribution}`} title={quote.attribution}>{quote.attribution}</cite>
    </blockquote>
  );
}

function NextMatchSummary({ match, timezone }: { match: FootballMatch; timezone: string }) {
  const kickoff = new Date(match.kickoff);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(kickoff);
  const time = clockTime(kickoff, timezone);
  const label = `Next West Ham match: ${match.homeTeam.name} versus ${match.awayTeam.name}, ${date} at ${time}`;
  return (
    <section className="next-match" aria-label={label}>
      <p className="eyebrow">Next West Ham game</p>
      <div className="next-match__fixture">
        <div className="next-match__team next-match__team--home">
          <img src={match.homeTeam.crestUrl} alt={`${match.homeTeam.name} crest`} />
          <strong title={match.homeTeam.name}>{match.homeTeam.name}</strong>
        </div>
        <div className="next-match__kickoff">
          <time dateTime={match.kickoff}>
            <span>{date}</span>
            <strong>{time}</strong>
          </time>
          <span className="next-match__competition" title={match.competition}>{match.competition}</span>
        </div>
        <div className="next-match__team next-match__team--away">
          <img src={match.awayTeam.crestUrl} alt={`${match.awayTeam.name} crest`} />
          <strong title={match.awayTeam.name}>{match.awayTeam.name}</strong>
        </div>
      </div>
      <small>Data and artwork: TheSportsDB</small>
    </section>
  );
}

const binLabels = { recycling: "Recycling", general: "General waste" } as const;

function BinReminderSummary({ reminder, timezone }: { reminder: BinReminder; timezone: string }) {
  const collectionDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: timezone }).format(new Date(`${reminder.collectionDate}T12:00:00Z`));
  return (
    <section className={`bin-reminder bin-reminder--${reminder.bin}`} aria-label={`${binLabels[reminder.bin]} bins out tonight for collection on ${collectionDay}`}>
      <BinIcon />
      <div>
        <strong>{binLabels[reminder.bin]} out tonight</strong>
        <span>Collection {collectionDay}</span>
      </div>
    </section>
  );
}

function untilLabel(lastDate: string, days: DisplayPayload["days"], timezone: string) {
  const day = days.find((candidate) => candidate.date === lastDate);
  return day
    ? { short: day.weekday, long: fullWeekdays[day.weekday] }
    : { short: shortDate(lastDate, timezone), long: longDate(lastDate, timezone) };
}

function todaySchedule(payload: DisplayPayload, now: Date) {
  const today = payload.days[0]!;
  const spans = new Map(payload.multiDay.map((event) => [event.id, event]));
  const notes = new Map<string, EventNote>();
  const remaining: EventOccurrence[] = [];
  let doneCount = 0;
  for (const event of today.events) {
    const span = spans.get(event.id);
    if (span && span.lastDate > today.date) {
      notes.set(event.id, { until: untilLabel(span.lastDate, payload.days, payload.timezone) });
      remaining.push(event);
      continue;
    }
    if (!event.allDay && Date.parse(event.end) <= now.getTime()) {
      doneCount += 1;
      continue;
    }
    remaining.push(event);
  }
  const timed = remaining.filter((event) => !event.allDay && !notes.has(event.id));
  const current = timed.filter((event) => Date.parse(event.start) <= now.getTime());
  current.forEach((event) => notes.set(event.id, { status: "now" }));
  const next = timed.find((event) => Date.parse(event.start) > now.getTime());
  if (next) notes.set(next.id, { status: "next" });
  return { events: remaining, notes, doneCount };
}

function Clock({ now, timezone }: { now: Date; timezone: string }) {
  const time = clockTime(now, timezone);
  return <time className="day-panel__clock" dateTime={now.toISOString()} aria-label={`Time ${time}`}>{time}</time>;
}

// The left rail mirrors the calendar key rail: the time, date, weather and
// what to wear, as one centred panel beside today's plan.
function DayPanel({ day, timezone, now }: { day: DisplayDay; timezone: string; now: Date }) {
  return (
    <aside className="day-panel" aria-label="Time and weather">
      <div className="day-panel__when">
        <Clock now={now} timezone={timezone} />
        <h2 aria-label={`Today · ${day.weekday} ${longDate(day.date, timezone)}`}>
          <span className="day-panel__weekday">{fullWeekdays[day.weekday]}</span> {longDate(day.date, timezone)}
        </h2>
      </div>
      <TodayWeather day={day} now={now} timezone={timezone} />
      {day.weather && <Outfit outfit={day.weather.outfit} today />}
    </aside>
  );
}

function TodayCard({ payload, now }: { payload: DisplayPayload; now: Date }) {
  const day = payload.days[0]!;
  const timezone = payload.timezone;
  const schedule = todaySchedule(payload, now);
  return (
    <section className="today-card">
      <div className="today-card__schedule">
        <p className="eyebrow schedule-heading">
          <span>Schedule for today</span>
          {schedule.doneCount > 0 && <span className="schedule-heading__done">{schedule.doneCount} done</span>}
        </p>
        <Events events={schedule.events} notes={schedule.notes} timezone={timezone} adaptive emptyText={schedule.doneCount > 0 ? "All done for today" : "Nothing planned"} />
      </div>
      <div className="today-card__aside">
        {payload.binReminder && <BinReminderSummary reminder={payload.binReminder} timezone={timezone} />}
        <MealSummary meal={day.meal} today />
        {payload.nextMatch && <NextMatchSummary match={payload.nextMatch} timezone={timezone} />}
        {payload.morningQuote && <MorningQuoteSummary quote={payload.morningQuote} />}
      </div>
    </section>
  );
}

function FutureDay({ day, timezone, events, column }: { day: DisplayDay; timezone: string; events: EventOccurrence[]; column?: number | undefined }) {
  return (
    <section className="future-day" data-testid="future-day" style={column ? { gridColumn: column } : undefined}>
      <div className="future-day__summary">
        <h2 className="future-day__date">
          <span>{day.weekday}</span>
          <strong>{datePart(day.date, timezone, "day")}</strong>
        </h2>
        <Weather day={day} />
        <MealSummary meal={day.meal} />
      </div>
      <Events events={events} timezone={timezone} compact adaptive />
    </section>
  );
}

type PlacedSpan = { event: MultiDayEvent; start: number; end: number; lane: number; continuesBefore: boolean; continuesAfter: boolean };

// Multi-day events become bars across the upcoming cards. Two lanes keep the
// cards readable; any further overlapping events fall back into each day's list.
const MAX_SPAN_LANES = 2;

function placeSpans(multiDay: MultiDayEvent[], days: DisplayDay[]) {
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const laneEnds: number[] = [];
  const placed: PlacedSpan[] = [];
  const unplaced: MultiDayEvent[] = [];
  for (const event of multiDay) {
    if (event.lastDate < first || event.firstDate > last) continue;
    const start = event.firstDate < first ? 0 : days.findIndex((day) => day.date === event.firstDate);
    const end = event.lastDate > last ? days.length - 1 : days.findIndex((day) => day.date === event.lastDate);
    if (start < 0 || end < start) continue;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
    if (lane === -1 && laneEnds.length >= MAX_SPAN_LANES) {
      unplaced.push(event);
      continue;
    }
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    placed.push({ event, start, end, lane, continuesBefore: event.firstDate < first, continuesAfter: event.lastDate > last });
  }
  return { placed, unplaced, lanes: laneEnds.length };
}

function SpanBar({ span, days }: { span: PlacedSpan; days: DisplayDay[] }) {
  const { event } = span;
  const from = fullWeekdays[days[span.start]!.weekday];
  const to = fullWeekdays[days[span.end]!.weekday];
  const label = `${groupLabels[event.group].accessible}: ${event.title}, ${span.continuesBefore ? "continuing" : "from"} ${from} to ${to}${span.continuesAfter ? " and beyond" : ""}`;
  return (
    <div
      className={`span-bar event--${event.group}${span.continuesBefore ? " span-bar--before" : ""}${span.continuesAfter ? " span-bar--after" : ""}`}
      style={{ gridColumn: `${span.start + 1} / ${span.end + 2}`, gridRow: span.lane + 2 }}
      aria-label={label}
      data-testid="span-bar"
    >
      <strong className="span-bar__title" title={event.title}>{event.title}</strong>
      <span className="event__group" aria-hidden="true">{groupLabels[event.group].short}</span>
    </div>
  );
}

function FutureGrid({ payload, wide }: { payload: DisplayPayload; wide: boolean }) {
  const days = payload.days.slice(1);
  const { placed, unplaced, lanes } = wide ? placeSpans(payload.multiDay, days) : { placed: [], unplaced: payload.multiDay, lanes: 0 };
  const eventsFor = (day: DisplayDay) => [
    ...unplaced.filter((event) => event.firstDate <= day.date && event.lastDate >= day.date)
      .map(({ id, title, start, end, allDay, group, location }) => ({ id, title, start, end, allDay, group, location })),
    ...day.events,
  ];
  return (
    <div
      className={`future-grid${wide ? " future-grid--spans" : ""}`}
      style={wide ? { gridTemplateRows: `auto ${"auto ".repeat(lanes)}minmax(0, 1fr)` } : undefined}
    >
      {days.map((day, index) => <FutureDay day={day} timezone={payload.timezone} events={eventsFor(day)} column={wide ? index + 1 : undefined} key={day.date} />)}
      {placed.map((span) => <SpanBar span={span} days={days} key={span.event.id} />)}
    </div>
  );
}

function Freshness({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  const time = clockTime(new Date(payload.generatedAt), payload.timezone);
  return <p className={`freshness${stale ? " freshness--stale" : ""}`}>{stale ? `Last updated ${time} · offline` : `Updated ${time}`}</p>;
}

function StaleAlert({ payload, now }: { payload: DisplayPayload; now: Date }) {
  const updatedAt = new Date(payload.calendarUpdatedAt);
  const outOfDate = now.getTime() - updatedAt.getTime() > STALE_ALERT_MS;
  const wrongDay = payload.days[0]!.date !== localDate(now, payload.timezone);
  if (!outOfDate && !wrongDay) return null;
  const time = clockTime(updatedAt, payload.timezone);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: payload.timezone }).format(updatedAt);
  const sameDay = localDate(updatedAt, payload.timezone) === localDate(now, payload.timezone);
  return (
    <div className="stale-alert" role="alert">
      <strong>Not updated since {time}{sameDay ? "" : ` on ${day}`}</strong>
      <span>The calendar may be out of date. Check the display’s connection.</span>
    </div>
  );
}

const colourGuide = [
  { googleColour: "Grape", group: "H + Chantele", label: "H + C", className: "grape" },
  { googleColour: "Blueberry", group: "All", label: "All", className: "blueberry" },
  { googleColour: "Basil", group: "Rafe", label: "Rafe", className: "basil" },
  { googleColour: "Graphite", group: "H", label: "H", className: "graphite" },
  { googleColour: "Beetroot", group: "Chantele", label: "Chantele", className: "beetroot" },
  { googleColour: "Tangerine", group: "Home", label: "Home", className: "tangerine" },
] as const;

function ColourGuide({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  return (
    <aside className="colour-guide" aria-label="Google Calendar colour guide">
      <div className="colour-guide__header">
        <p className="eyebrow colour-guide__title">Calendar key</p>
        <Freshness payload={payload} stale={stale} />
      </div>
      <div className="colour-guide__items">
        {colourGuide.map((item) => (
          <span className="colour-guide__item" key={item.googleColour} aria-label={`${item.googleColour}: ${item.group}`}>
            <span className={`colour-guide__swatch colour-guide__swatch--${item.className}`} aria-hidden="true" />
            <strong>{item.label}</strong>
          </span>
        ))}
      </div>
    </aside>
  );
}

// The rail is short, so only the three nearest countdowns are shown.
const VISIBLE_COUNTDOWNS = 3;

function countdownText(daysAway: number) {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `${daysAway} days`;
}

function Countdowns({ countdowns }: { countdowns: Countdown[] }) {
  if (countdowns.length === 0) return null;
  return (
    <section className="countdowns" aria-label="Countdowns">
      <p className="eyebrow">Coming up</p>
      <ul>
        {countdowns.slice(0, VISIBLE_COUNTDOWNS).map((countdown) => (
          <li key={countdown.id} className="countdown" aria-label={`${countdown.title}: ${countdownText(countdown.daysAway).toLowerCase()}`}>
            <span className={`countdown__dot event--${countdown.group}`} aria-hidden="true" />
            <strong className="countdown__title" title={countdown.title}>{countdown.title}</strong>
            <span className="countdown__days">{countdownText(countdown.daysAway)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function YesterdayPanel({ payload }: { payload: DisplayPayload }) {
  return (
    <aside className="yesterday-panel" aria-label="Previous day">
      <h2>Yesterday · {payload.yesterday.weekday} {longDate(payload.yesterday.date, payload.timezone)}</h2>
      <Events events={payload.yesterday.events} timezone={payload.timezone} compact adaptive />
    </aside>
  );
}

function DisplayBoard({ payload, stale }: { payload: DisplayPayload; stale: boolean }) {
  const now = useNow();
  const wide = useWideLayout();
  return (
    <main className="display-board">
      <div className="top-row">
        <DayPanel day={payload.days[0]!} timezone={payload.timezone} now={now} />
        <TodayCard payload={payload} now={now} />
        <div className="top-row__rail">
          <section className="rail-card">
            <ColourGuide payload={payload} stale={stale} />
            <Countdowns countdowns={payload.countdowns} />
          </section>
          <YesterdayPanel payload={payload} />
        </div>
      </div>
      <FutureGrid payload={payload} wide={wide} />
      <StaleAlert payload={payload} now={now} />
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
