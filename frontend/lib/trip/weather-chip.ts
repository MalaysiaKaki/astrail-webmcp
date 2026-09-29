import type { TripDay } from './backend-types'

/**
 * A day header's weather chip (plan amendment 9).
 *
 * `trip_days.weather_payload` comes in two shapes: the pipeline writes Open-Meteo's report
 * (`temp_min_c`, `temp_max_c`, `precipitation_mm`, `weather_code`: backend/genagents/weather.py),
 * while the demo fixture carries `temperatureC` and `precipitationChance` (a percent). Both are read;
 * millimetres and percent are never confused for one another.
 *
 * The icon comes from the WMO weather code ONLY, bucketed exactly as the backend buckets its own
 * summary. It is never inferred from a temperature or a rain figure: 55% rain is not "rain".
 * Code 0 is Clear, not missing. With nothing usable in the payload the chip is the stored summary
 * text; with neither, there is no chip.
 */
export type WeatherIcon = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'showers' | 'storm'

export type WeatherChip = {
  icon: WeatherIcon | null
  /** Short, for the chip. */
  text: string
  /** The full statement, for the accessible name and the tooltip. */
  label: string
}

const BUCKETS: [readonly number[], WeatherIcon, string][] = [
  [[0], 'clear', 'Clear'],
  [[1, 2, 3], 'cloud', 'Partly cloudy'],
  [[45, 48], 'fog', 'Fog'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle'],
  [[61, 63, 65, 66, 67], 'rain', 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'Snow'],
  [[80, 81, 82], 'showers', 'Showers'],
  [[95, 96, 99], 'storm', 'Thunderstorm'],
]

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function temperature(p: Record<string, unknown>): string | null {
  const lo = num(p.temp_min_c)
  const hi = num(p.temp_max_c)
  if (lo !== null && hi !== null) return lo === hi ? `${fmt(hi)}°C` : `${fmt(Math.round(lo))}–${fmt(Math.round(hi))}°C`
  const one = num(p.temperatureC) ?? hi ?? lo
  return one === null ? null : `${fmt(Math.round(one))}°C`
}

function precipitation(p: Record<string, unknown>): string | null {
  const mm = num(p.precipitation_mm)
  if (mm !== null && mm >= 0) return `${fmt(Math.round(mm * 10) / 10)} mm`
  const pct = num(p.precipitationChance)
  if (pct !== null && pct >= 0 && pct <= 100) return `${Math.round(pct)}% rain`
  return null
}

export function weatherChip(day: Pick<TripDay, 'weather_payload' | 'weather_summary'>): WeatherChip | null {
  const p = day.weather_payload && typeof day.weather_payload === 'object' ? day.weather_payload : {}
  const code = num(p.weather_code)
  const bucket = code === null ? null : BUCKETS.find(([codes]) => codes.includes(code)) ?? null
  const summary = day.weather_summary?.trim() || null
  const parts = [temperature(p), precipitation(p)].filter((x): x is string => x !== null)
  const text = parts.length ? parts.join(' · ') : summary ?? bucket?.[2] ?? null
  if (!text) return null
  return { icon: bucket?.[1] ?? null, text, label: summary ?? bucket?.[2] ?? text }
}
