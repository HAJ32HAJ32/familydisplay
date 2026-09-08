import type { Meal, Outfit, WeatherCondition } from "@family-display/contract";
import type { ReactNode } from "react";

type IconFrameProps = { children: ReactNode; testId: string; className?: string };

function IconFrame({ children, testId, className = "" }: IconFrameProps) {
  return (
    <svg className={`icon ${className}`.trim()} data-testid={testId} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const sun = <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>;
const cloud = <path d="M6.5 18h10.8a4.2 4.2 0 0 0 .4-8.4A6.2 6.2 0 0 0 6 8.1 4.9 4.9 0 0 0 6.5 18Z" />;
const rain = <><path d="M6.5 15h10.8a4.2 4.2 0 0 0 .4-8.4A6.2 6.2 0 0 0 6 5.1 4.9 4.9 0 0 0 6.5 15Z" /><path d="m8 18-1 2M13 18l-1 2M18 18l-1 2" /></>;

export function WeatherIcon({ condition }: { condition: WeatherCondition }) {
  let paths: ReactNode = cloud;
  if (condition === "clear") paths = sun;
  if (condition === "partly-cloudy") paths = <><path d="M7 4.5V3M3.5 8H2M4.5 5.5 3.4 4.4" /><circle cx="7" cy="8" r="3" />{cloud}</>;
  if (condition === "fog") paths = <><path d="M5 9h11M3 13h16M6 17h12" /></>;
  if (condition === "drizzle" || condition === "rain" || condition === "showers") paths = rain;
  if (condition === "snow") paths = <>{cloud}<path d="M8 19h.01M12 21h.01M16 19h.01" strokeWidth="3" /></>;
  if (condition === "thunderstorm") paths = <>{cloud}<path d="m13 15-2 4h3l-2 3" /></>;
  return <IconFrame testId={`weather-icon-${condition}`} className="icon--weather">{paths}</IconFrame>;
}

export function OutfitIcon({ outfit }: { outfit: Outfit }) {
  let paths: ReactNode;
  if (outfit === "tshirt") paths = <path d="m8 4-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3a5 5 0 0 1-8 0Z" />;
  else if (outfit === "long-sleeve") paths = <path d="m8 4-3 2-3 9 4 1 1-5v9h10v-9l1 5 4-1-3-9-3-2a5 5 0 0 1-8 0Z" />;
  else if (outfit === "hoodie") paths = <><path d="M8 6 5 8l-2 8 4 1 1-5v8h8v-8l1 5 4-1-2-8-3-2" /><path d="M8 6c0-4 8-4 8 0l-2 3h-4L8 6Z" /></>;
  else if (outfit === "raincoat") paths = <><path d="M8 6 5 8l-2 8 4 1 1-5v8h8v-8l1 5 4-1-2-8-3-2" /><path d="M9 6c0-5 6-5 6 0M12 8v12" /></>;
  else paths = <><path d="M9 4 6 7 4 20h16L18 7l-3-3" /><path d="M9 4c0 4 6 4 6 0M12 8v12" /></>;
  return <IconFrame testId={`outfit-icon-${outfit}`} className="icon--outfit">{paths}</IconFrame>;
}

export function MealIcon({ type }: { type: Meal["type"] }) {
  let paths: ReactNode;
  if (type === "takeaway") paths = <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8c0-5 6-5 6 0M8 12h8" /></>;
  else if (type === "out") paths = <><path d="M6 3v7M3.5 3v4c0 2 5 2 5 0V3M6 10v11M16 3v18M16 3c4 2 4 7 0 9" /></>;
  else paths = <><path d="M4 17h16M6 17a6 6 0 0 1 12 0M12 7V5M10 5h4" /></>;
  return <IconFrame testId={`meal-icon-${type}`} className="icon--meal">{paths}</IconFrame>;
}
