/**
 * A leg's duration as the stop list prints it ("3 min", "1h 5m"). One formatter, so the leg
 * connector and anything else that shows a leg can never print two different durations for it.
 * Moved from the retired TransportStrip (plan A8); the output is unchanged.
 */
export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
}
