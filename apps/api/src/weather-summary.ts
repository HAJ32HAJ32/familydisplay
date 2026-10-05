import type { WeatherSummary } from "@family-display/contract";
import type { RawWeather } from "./display-service.js";
import { chooseOutfit } from "./outfit.js";
import { weatherCondition } from "./weather-condition.js";

// Waking hours run from 07:00 until 21:00, so overnight rain or a cold dawn
// does not decide what to wear for the day.
const FIRST_WAKING_HOUR = 7;
const LAST_WAKING_HOUR = 20;
const RAIN_LIKELY_PERCENT = 50;

const twoDigits = (value: number) => String(value).padStart(2, "0");

export function summariseWeather(raw: RawWeather, fromHour = 0): WeatherSummary {
  const waking = (raw.hours ?? []).filter(({ hour }) => hour >= FIRST_WAKING_HOUR && hour <= LAST_WAKING_HOUR);
  const temperatures = waking.flatMap(({ tempC }) => tempC === null ? [] : [tempC]);
  const chances = waking.flatMap(({ precipitationChance }) => precipitationChance === null ? [] : [precipitationChance]);
  const typicalTemp = temperatures.length > 0 ? (Math.min(...temperatures) + Math.max(...temperatures)) / 2 : raw.tempMaxC;
  const precipitationChance = Math.round(chances.length > 0 ? Math.max(...chances) : raw.precipitationChance);
  const firstWetHour = waking.find(({ hour, precipitationChance: chance }) => hour >= fromHour && chance !== null && chance >= RAIN_LIKELY_PERCENT);
  return {
    tempMaxC: Math.round(raw.tempMaxC * 10) / 10,
    tempMinC: raw.tempMinC === undefined || raw.tempMinC === null ? null : Math.round(raw.tempMinC * 10) / 10,
    precipitationChance,
    rainFrom: firstWetHour ? `${twoDigits(firstWetHour.hour)}:00` : null,
    sunrise: raw.sunrise ?? null,
    sunset: raw.sunset ?? null,
    condition: weatherCondition(raw.weatherCode),
    outfit: chooseOutfit(typicalTemp, precipitationChance)
  };
}
