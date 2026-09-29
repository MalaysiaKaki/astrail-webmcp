/**
 * Read-only hotel list for the widget (PLAN §6). HotelPanel is the app's hub PICKER — it needs a
 * selection callback and a map layer mode, neither of which exists here — so the widget gets its
 * own renderer rather than a changed shared component. No selection, no "On map": there is no map.
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

export default function HotelSummary({ hotels }: { hotels: HotelSuggestion[] }) {
  if (hotels.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {[...hotels].sort(byRank).map((h) => {
        const meta = [
          priceLabel(h.price_snapshot),
          h.area,
          h.star_rating ? `${h.star_rating}★` : null,
          h.guest_rating != null ? `${h.guest_rating}/10 guests` : null,
        ].filter(Boolean).join(' · ')
        return (
          <li key={h.id} className="surface rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="type-display truncate text-sm text-[var(--starlight)]">{h.name}</span>
              <span className="type-label shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {STATUS_LABEL[h.status]}
              </span>
            </div>
            {h.is_recommended ? (
              <span className="type-label mt-1 inline-block rounded-[var(--radius-chip)] bg-[var(--brass-soft)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--brass-bright)]">
                Recommended
              </span>
            ) : null}
            {meta ? <p className="type-body mt-1 text-xs text-[var(--muted)]">{meta}</p> : null}
            {/* Guardrail #1: a hotel Astrail could not place is still listed, but says so. */}
            {h.geo_status === 'unresolved' ? (
              <p className="type-body mt-1 text-[11px] text-[var(--muted)]">Location unconfirmed.</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
