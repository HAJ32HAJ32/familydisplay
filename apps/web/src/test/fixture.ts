export const payload = {
  generatedAt: "2026-08-27T18:42:00+01:00",
  timezone: "Europe/London",
  morningQuote: { text: "Do the work in front of you.", attribution: "Marcus Aurelius" },
  yesterday: {
    date: "2026-08-26",
    weekday: "Wed",
    events: [
      { id: "evt_y", title: "Bins out", start: "2026-08-26T07:00:00+01:00", end: "2026-08-26T07:15:00+01:00", allDay: false, group: "h", location: "" },
    ],
  },
  days: [
    {
      date: "2026-08-27", weekday: "Thu", isToday: true,
      weather: { tempMaxC: 19, precipitationChance: 65, condition: "rain", outfit: "raincoat" },
      events: [
        { id: "evt_all", title: "Family day", start: "2026-08-27T00:00:00+01:00", end: "2026-08-28T00:00:00+01:00", allDay: true, group: "all", location: "Home" },
        { id: "evt_r", title: "Nursery drop-off", start: "2026-08-27T08:30:00+01:00", end: "2026-08-27T09:00:00+01:00", allDay: false, group: "rafe", location: "Nursery" },
      ], meal: { type: "recipe", title: "Stir fry" },
    },
    { date: "2026-08-28", weekday: "Fri", isToday: false, weather: { tempMaxC: 21, precipitationChance: 5, condition: "clear", outfit: "tshirt" }, events: [{ id: "evt_hc", title: "Date night", start: "2026-08-28T19:00:00+01:00", end: "2026-08-28T21:00:00+01:00", allDay: false, group: "h-and-chantele", location: "" }], meal: { type: "takeaway" } },
    { date: "2026-08-29", weekday: "Sat", isToday: false, weather: { tempMaxC: 18, precipitationChance: 20, condition: "partly-cloudy", outfit: "long-sleeve" }, events: [{ id: "evt_c", title: "Appointment", start: "2026-08-29T11:00:00+01:00", end: "2026-08-29T11:30:00+01:00", allDay: false, group: "chantele", location: "Clinic" }], meal: { type: "out" } },
    { date: "2026-08-30", weekday: "Sun", isToday: false, weather: { tempMaxC: 16, precipitationChance: 35, condition: "cloudy", outfit: "long-sleeve" }, events: [{ id: "evt_household", title: "Cleaner", start: "2026-08-30T10:00:00+01:00", end: "2026-08-30T12:00:00+01:00", allDay: false, group: "household", location: "" }], meal: { type: "recipe", title: "Sunday roast" } },
    { date: "2026-08-31", weekday: "Mon", isToday: false, weather: { tempMaxC: 14, precipitationChance: 45, condition: "fog", outfit: "long-sleeve" }, events: [], meal: null },
    { date: "2026-09-01", weekday: "Tue", isToday: false, weather: { tempMaxC: 7, precipitationChance: 55, condition: "snow", outfit: "raincoat" }, events: [], meal: { type: "recipe", title: "Pasta bake" } },
    { date: "2026-09-02", weekday: "Wed", isToday: false, weather: { tempMaxC: 17, precipitationChance: 80, condition: "thunderstorm", outfit: "raincoat" }, events: [], meal: { type: "recipe", title: "Chicken fajitas" } },
  ],
} as const;
