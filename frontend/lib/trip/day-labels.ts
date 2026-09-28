/**
 * How a trip day is named in the phone's date strip and day sub-header.
 *
 * Date-only, from `day_date` ("YYYY-MM-DD"), formatted in UTC so the calendar date is the one the
 * backend wrote whatever the visitor's zone — `new Date('2026-09-18')` is UTC midnight, which a
 * browser west of Greenwich would print as the 17th. Locale pinned to en-US for the same reason
 * DaySelector pins it: the server pass and the browser must spell it identically.
 *
 * A null or malformed date falls back to "Day N" rather than a guessed or "Invalid Date" string.
 */
export type DayLabel = {
  /** The large figure in the strip: the day of the month, or the day number when undated. */
  big: string
  /** The small-caps line under it: the weekday ("thu"), or "day" when undated. */
  small: string
  /** "Sep 18" for the sub-header, or null when undated. */
  monthDay: string | null
  /** Accessible name for the strip button: "Day 1, Thu 18 Sep", or "Day 1". */
  name: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDate(iso: string | null): Date | null {
  const m = iso ? ISO_DATE.exec(iso) : null
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  // Date.UTC rolls 2026-02-30 over to March 2; a date that does not round-trip is not a date.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return date
}

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

export function dayLabel(day: { day_number: number; day_date: string | null }): DayLabel {
  const date = parseDate(day.day_date)
  if (!date) {
    return { big: String(day.day_number), small: 'day', monthDay: null, name: `Day ${day.day_number}` }
  }
  const weekday = fmt(date, { weekday: 'short' })
  const month = fmt(date, { month: 'short' })
  const dom = String(date.getUTCDate())
  return {
    big: dom,
    small: weekday.toLowerCase(),
    monthDay: `${month} ${dom}`,
    name: `Day ${day.day_number}, ${weekday} ${dom} ${month}`,
  }
}
