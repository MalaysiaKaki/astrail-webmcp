/**
 * Read-only Stay list for the widget, drawn like the phone's (HotelPanel's kit rows): a hotel the
 * app would offer as a map hub sits on an `m-card`, anything else on a plain `m-subcard`.
 *
 * Not HotelPanel itself: there a row is a hub-PICKER button with a chevron, and a tap only picks
 * which hotel the map draws. The widget has no map, so the same button would promise an action
 * it cannot take. No selection, no "On map", and an unplaced hotel says its location is
 * unconfirmed rather than "we couldn't place it on the map" (there is no map here).
 */
import type { HotelStatus, HotelSuggestion } from '@/lib/trip/backend-types'

const STATUS_LABEL: Record<HotelStatus, string> = {
  suggested: 'Suggested',
  unavailable: 'Unavailable',
  skipped: 'Skipped',
  failed: 'Search failed',
}

/* Same reading as HotelPanel's priceLabel (not exported there): per-night first, the stay total as
   the fallback, and a missing, zero or non-finite figure renders no price rather than "0/night". */
export function priceLabel(snap: Record<string, unknown>): string | null {
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
  const cur = typeof snap.currency === 'string' ? snap.currency : ''
  const night = num(snap.pricePerNight)
  if (night != null) return cur ? `${fmt(night)} ${cur}/night` : `${fmt(night)}/night`
  const total = num(snap.totalPrice)
  if (total != null) return cur ? `${fmt(total)} ${cur} total` : `${fmt(total)} total`
  return null
}

// The backend already orders by (rank asc nulls last, id); sorted again so the rank-1 pick leads
// even if a future producer does not.
const byRank = (a: HotelSuggestion, b: HotelSuggestion) =>
  (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY)

/** HotelPanel's isSelectableHub: the rows the app draws as raised cards. */
const isHub = (h: HotelSuggestion) =>
  h.geo_status === 'placed' && h.rank != null && h.lat != null && h.lng != null

export default function HotelSummary({ hotels }: { hotels: HotelSuggestion[] }) {
  if (hotels.length === 0) return null
  return (
    <ul className="flex flex-col gap-3">
      {[...hotels].sort(byRank).map((h) => {
        const meta = [
          priceLabel(h.price_snapshot),
          h.area,
          h.star_rating ? `${h.star_rating}★` : null,
          h.guest_rating != null ? `${h.guest_rating}/10 guests` : null,
        ].filter(Boolean).join(' · ')
        return (
          <li key={h.id}>
            <div data-hotel-card className={[isHub(h) ? 'm-card' : 'm-subcard', 'flex px-4 py-3.5'].join(' ')}>
              <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <span className="flex items-start justify-between gap-2">
                  <span className="type-body min-w-0 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[var(--m-text)] [overflow-wrap:anywhere]">{h.name}</span>
                  <span className="type-body shrink-0 pt-0.5 text-[14px] text-[var(--m-text-muted)]">{STATUS_LABEL[h.status]}</span>
                </span>
                {h.is_recommended ? (
                  <span className="flex flex-wrap gap-1.5">
                    <span className="type-body rounded-full bg-[var(--m-accent-wash)] px-2.5 text-[12px] font-semibold leading-6 text-[var(--m-accent)]">
                      Recommended
                    </span>
                  </span>
                ) : null}
                {meta ? <span className="type-body text-[14px] text-[var(--m-text-muted)] [overflow-wrap:anywhere]">{meta}</span> : null}
                {/* Guardrail #1: a hotel Astrail could not place is still listed, but says so. */}
                {h.geo_status === 'unresolved' ? (
                  <span className="type-body text-[14px] text-[var(--m-text-muted)]">Location unconfirmed.</span>
                ) : null}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
