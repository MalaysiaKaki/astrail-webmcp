import type { HotelSuggestion, HotelStatus } from '@/lib/trip/backend-types'

const STATUS_LABEL: Record<HotelStatus, string> = {
  suggested: 'Suggested',
  unavailable: 'Unavailable',
  skipped: 'Skipped',
  failed: 'Search failed',
}

// price_snapshot mirrors persist_hotels' write shape ({pricePerNight, totalPrice, currency}) but
// is typed Record<string, unknown>, so read it defensively: anything non-finite renders no price
// at all (never "NaN/night"). Per-night is preferred; the stay total is the fallback so SOME
// price still shows when only totalPrice came back — same unit preference as backend tradeoffs.py.
function priceLabel(snap: Record<string, unknown> | null | undefined): string | null {
  // > 0: a zero or negative price is treated as missing, never rendered as "0 USD/night" (a
  // free-hotel claim we have no evidence for; review nit 2026-08-06).
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
  const cur = typeof snap?.currency === 'string' ? snap.currency : ''
  const night = num(snap?.pricePerNight)
  if (night != null) return cur ? `${fmt(night)} ${cur}/night` : `${fmt(night)}/night`
  const total = num(snap?.totalPrice)
  if (total != null) return cur ? `${fmt(total)} ${cur} total` : `${fmt(total)} total`
  return null
}

// The hotel list doubles as the hub picker (plan 2026-08-04-hotel-hub-map, T8). A hotel is a
// selectable map hub iff it is `geo_status==='placed'` AND in the backend's top-3 shortlist
// (`rank != null` — a placed hotel ranked 4+ carries rank===null and is NOT a hub candidate). An
// unresolved hotel has no pin to select (Guardrail #1), so it renders as a plain, non-interactive
// row with an honest "couldn't place it" note; a placed-but-unranked hotel also renders plainly but
// WITHOUT that note (it DID place — it's just not a top-3 candidate). `layerMode` is load-bearing:
// the picked hub is only DRAWN on the map in hub mode, so the "On map" indicator only appears there
// (in route mode the selection is latent).
export default function HotelPanel({
  hotels, selectedHotelId, onSelectHotel, layerMode, variant = 'default',
}: {
  hotels: HotelSuggestion[]
  selectedHotelId: string | null
  onSelectHotel: (id: string) => void
  layerMode: 'route' | 'hub'
  /** 'phone' draws the phone kit's Stay list (same rules, same honesty); default is desktop's. */
  variant?: 'default' | 'phone'
}) {
  if (variant === 'phone') {
    return <PhoneHotels hotels={hotels} selectedHotelId={selectedHotelId} onSelectHotel={onSelectHotel} layerMode={layerMode} />
  }
  if (hotels.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--line)] p-3">
        <p className="type-body text-xs text-[var(--muted)]">No hotel suggestions for these dates.</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {hotels.map((h) => {
        const inactive = h.status !== 'suggested'
        // Selectable hub = placed AND a top-3 candidate (rank set) AND has real coords the map can
        // draw. The coords check is defense-in-depth (Codex P2): a `placed` row with null lat/lng
        // is a partial write we must never offer as a hub — there is no point to pin.
        const selectable =
          h.geo_status === 'placed' && h.rank != null && h.lat != null && h.lng != null
        const selected = selectable && h.id === selectedHotelId
        // Price leads the meta line — it's the figure the user is deciding on (pre-beta fix:
        // price_snapshot has been persisted since day one but was never rendered).
        const meta = [priceLabel(h.price_snapshot), h.area, h.star_rating ? `${h.star_rating}★` : null]
          .filter(Boolean).join(' · ')

        // Identical body whether or not the row is a selectable hub-pick button.
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="type-display truncate text-sm text-[var(--starlight)]">{h.name}</span>
              <span className="type-label shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {STATUS_LABEL[h.status]}
              </span>
            </div>
            {(h.is_recommended || (selected && layerMode === 'hub')) ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {h.is_recommended ? (
                  <span className="type-label rounded-[var(--radius-chip)] bg-[var(--brass-soft)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--brass-bright)]">
                    Recommended
                  </span>
                ) : null}
                {/* Only the hub actually drawn on the map (hub mode) says so — honest about state. */}
                {selected && layerMode === 'hub' ? (
                  <span className="type-label rounded-[var(--radius-chip)] border border-[var(--line)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">
                    On map
                  </span>
                ) : null}
              </div>
            ) : null}
            {meta ? <p className="type-body mt-1 text-xs text-[var(--muted)]">{meta}</p> : null}
            {/* Honest-failure (Guardrail #1): an unplaceable hotel is never pinned; say why. */}
            {h.geo_status === 'unresolved' ? (
              <p className="type-body mt-1 text-[11px] text-[var(--muted)]">
                We couldn&apos;t place this hotel on the map.
              </p>
            ) : null}
          </>
        )

        if (selectable) {
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onSelectHotel(h.id)}
                aria-pressed={selected}
                className={[
                  'surface w-full rounded-lg p-2.5 text-left transition-colors',
                  selected ? 'surface--selected' : 'surface--hoverable',
                ].join(' ')}
              >
                {body}
              </button>
            </li>
          )
        }
        return (
          <li key={h.id} className={['surface rounded-lg p-2.5', inactive ? 'opacity-60' : ''].join(' ')}>
            {body}
          </li>
        )
      })}
    </ul>
  )
}

/* ---- Phone Stay list (A4) --------------------------------------------------------------------
   The same selectable-hub rule, labels and honest notes as above, drawn with the phone kit: a
   selectable hotel is an m-card surface holding one full-width button (ink outline when it is the
   chosen hub, as a stop card is); anything else is a plain, non-interactive sub-card. Tags are
   sentence case at 12px+, and an inactive row keeps full-contrast text (its status says why). */

function isSelectableHub(h: HotelSuggestion): boolean {
  return h.geo_status === 'placed' && h.rank != null && h.lat != null && h.lng != null
}

function Tag({ tone, children }: { tone: 'accent' | 'plain'; children: React.ReactNode }) {
  return (
    <span className={[
      'type-body rounded-full px-2.5 text-[12px] font-semibold leading-6',
      tone === 'accent' ? 'bg-[var(--m-accent-wash)] text-[var(--m-accent)]' : 'bg-[var(--m-subcard)] text-[var(--m-text)]',
    ].join(' ')}>
      {children}
    </span>
  )
}

function PhoneHotels({ hotels, selectedHotelId, onSelectHotel, layerMode }: {
  hotels: HotelSuggestion[]
  selectedHotelId: string | null
  onSelectHotel: (id: string) => void
  layerMode: 'route' | 'hub'
}) {
  if (hotels.length === 0) {
    return <p className="type-body m-subcard px-4 py-3 text-[15px] text-[var(--m-text-muted)]">No hotel suggestions for these dates.</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {hotels.map((h) => {
        const selectable = isSelectableHub(h)
        const selected = selectable && h.id === selectedHotelId
        const meta = [priceLabel(h.price_snapshot), h.area, h.star_rating ? `${h.star_rating}★` : null]
          .filter(Boolean).join(' · ')
        const body = (
          <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span className="flex items-start justify-between gap-2">
              <span className="type-body min-w-0 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[var(--m-text)]">{h.name}</span>
              <span className="type-body shrink-0 pt-0.5 text-[13px] text-[var(--m-text-muted)]">{STATUS_LABEL[h.status]}</span>
            </span>
            {h.is_recommended || (selected && layerMode === 'hub') ? (
              <span className="flex flex-wrap gap-1.5">
                {h.is_recommended ? <Tag tone="accent">Recommended</Tag> : null}
                {selected && layerMode === 'hub' ? <Tag tone="plain">On map</Tag> : null}
              </span>
            ) : null}
            {meta ? <span className="type-body text-[14px] text-[var(--m-text-muted)]">{meta}</span> : null}
            {h.geo_status === 'unresolved' ? (
              <span className="type-body text-[14px] text-[var(--m-text-muted)]">We couldn&apos;t place this hotel on the map.</span>
            ) : null}
          </span>
        )
        if (selectable) {
          return (
            <li key={h.id}>
              <div
                data-hotel-card
                className={[
                  'm-card transition-transform duration-[var(--m-dur-press)] motion-reduce:transition-none',
                  'has-[>button:active]:scale-[0.985] motion-reduce:has-[>button:active]:scale-100',
                  'has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-solid has-[>button:focus-visible]:outline-[var(--m-accent)]',
                  selected ? 'outline-2 outline-solid outline-[var(--m-ink)]' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => onSelectHotel(h.id)}
                  aria-pressed={selected}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[var(--m-r-card)] px-4 py-3.5 focus-visible:outline-none"
                >
                  {body}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden className="m-chevron">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              </div>
            </li>
          )
        }
        return (
          <li key={h.id}>
            <div data-hotel-card className="m-subcard flex px-4 py-3.5">{body}</div>
          </li>
        )
      })}
    </ul>
  )
}
