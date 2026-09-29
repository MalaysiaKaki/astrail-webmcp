'use client'

import type { Place, RestaurantSuggestion, TripPlace } from '@/lib/trip/backend-types'
import { hasRealCoords } from '@/lib/trip/selectors'
import type { StopProvenance } from '@/lib/trip/stop-provenance'
import { safeHref } from '@/lib/safe-href'
import type { PopupModel } from '@/components/map/popup-model'
import { evidenceKindLabel } from '@/lib/trip/evidence-kind'
import EatCardLinks from './EatCardLinks'

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * One stop as a Placify-style card (compare placify appstore/02): an ink number badge, the name,
 * a muted category-and-provenance line, and the evidence nested in a grey sub-card — the Reel
 * still on the left, the caption quote beside it.
 *
 * The white surface is a plain `m-card` holding a full-width button (the collapsed card) plus,
 * when selected, the inline detail. Not an `m-card-link`: the detail carries its own controls
 * (Source, the places to eat), and interactive content cannot nest inside a button. Press
 * feedback and the focus ring are drawn on the surface through `has-[>button:…]`.
 *
 * The selected card gets an ink OUTLINE, not a ring: a Tailwind ring is a box-shadow, which the
 * kit's unlayered `.m-card` shadow would silently override.
 */
export default function StopCard({
  tp, pin, total, provenance: p, thumbnail, selected, eatCount, onTap,
  restaurants, placeIndex, selectedRestaurantPlaceId, onSelectRestaurant,
  detail = null, showConfidence = false, onShow3d,
}: {
  tp: TripPlace
  /** The trail number the map pin paints, or undefined for an unnumbered (unplaced) stop. */
  pin: number | undefined
  total: number
  provenance: StopProvenance
  thumbnail: string | null
  selected: boolean
  eatCount: number
  onTap: () => void
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  selectedRestaurantPlaceId: string | null
  onSelectRestaurant: (placeId: string) => void
  /** The open card's trip-relative detail (Reel link, local-script name, confidence). */
  detail?: PopupModel | null
  /** Desktop only: the confidence chip. The phone's provenance line already says the source. */
  showConfidence?: boolean
  /** "Show in 3D": turns the map's 3D mode on and flies to this stop at street level. */
  onShow3d?: () => void
}) {
  return (
    <div
      data-stop-card
      className={[
        'm-card transition-transform duration-[var(--m-dur-press)] motion-reduce:transition-none',
        'has-[>button:active]:scale-[0.985] motion-reduce:has-[>button:active]:scale-100',
        'has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-solid has-[>button:focus-visible]:outline-[var(--m-accent)]',
        selected ? 'outline-2 outline-solid outline-[var(--m-ink)]' : '',
      ].join(' ')}
    >
      <button
        type="button"
        data-place-id={tp.place_id}
        aria-expanded={selected}
        aria-current={selected ? 'true' : undefined}
        onClick={onTap}
        className="flex w-full flex-col rounded-[var(--m-r-card)] px-4 py-3 text-left focus-visible:outline-none"
      >
        <span className="flex w-full items-center gap-3">
          <span
            data-badge
            className={[
              'type-body flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums',
              pin != null
                ? 'bg-[var(--m-ink)] text-[var(--m-on-ink)]'
                : 'border-2 border-dashed border-[rgba(28,23,16,0.28)]',
            ].join(' ')}
          >
            {pin != null ? pin : ''}
          </span>
          <span className="sr-only">{pin != null ? `Stop ${pin} of ${total}` : 'Unnumbered stop'}</span>
          <span className="min-w-0 flex-1">
            <span className="type-body block truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[var(--m-text)]">
              {tp.place.name}
            </span>
            <span className="type-body mt-0.5 block truncate text-[14px] text-[var(--m-text-muted)]">
              <span>{humanize(tp.place.place_type)}</span>
              <span aria-hidden> · </span>
              <span className={p.kind === 'none' ? '' : 'font-medium text-[var(--m-accent)]'}>{p.label}</span>
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
            className={['m-chevron transition-transform motion-reduce:transition-none', selected ? 'rotate-180' : ''].join(' ')}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <Evidence p={p} thumbnail={thumbnail} full={selected} />
        {!selected && eatCount > 0 ? (
          <span className="type-body mt-2 pl-10 text-[14px] text-[var(--m-text-muted)]">
            {eatCount} {eatCount === 1 ? 'place' : 'places'} to eat nearby
          </span>
        ) : null}
      </button>
      {selected ? (
        <StopDetail
          tp={tp}
          provenance={p}
          detail={detail}
          showConfidence={showConfidence}
          onShow3d={onShow3d}
          restaurants={restaurants}
          placeIndex={placeIndex}
          selectedRestaurantPlaceId={selectedRestaurantPlaceId}
          onSelectRestaurant={onSelectRestaurant}
        />
      ) : null}
    </div>
  )
}

/**
 * The nested evidence sub-card. Only when there is evidence text to show: a Reel stop without a
 * quote says "No caption evidence" in its meta line and gets no sub-card, rather than a grey box
 * that looks like it is holding something. A suggestion's rationale is Astrail's words, so it is
 * never dressed in quote marks.
 */
function Evidence({ p, thumbnail, full }: { p: StopProvenance; thumbnail: string | null; full: boolean }) {
  if (!p.text) return null
  const quoted = p.kind === 'reel' || p.kind === 'requested'
  const src = thumbnail ? safeHref(thumbnail) : undefined
  return (
    <span data-evidence className="m-subcard mt-2.5 flex w-full items-center gap-3 p-2">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-[0_1px_3px_rgba(28,23,16,0.18)]" />
      ) : null}
      {/* Verbatim, never transformed: upright, clamped to two lines until the card is opened. */}
      <span className={['type-body min-w-0 text-[15px] leading-snug text-[rgba(28,23,16,0.78)]', full ? '' : 'line-clamp-2'].join(' ')}>
        {quoted ? `“${p.text}”` : p.text}
      </span>
    </span>
  )
}

function StopDetail({
  tp, provenance, detail, showConfidence, onShow3d, restaurants, placeIndex, selectedRestaurantPlaceId, onSelectRestaurant,
}: {
  tp: TripPlace
  provenance: StopProvenance
  detail: PopupModel | null
  showConfidence: boolean
  onShow3d?: () => void
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  selectedRestaurantPlaceId: string | null
  onSelectRestaurant: (placeId: string) => void
}) {
  const { place, evidence_json: ev } = tp
  const located = hasRealCoords(place.lng, place.lat)
  const extraQuotes = ev.quotes.filter((q) => q.trim() && q !== ev.quote)
  const where = [place.area, place.city, place.country].filter(Boolean).join(', ')
  const reel = detail?.reel ? safeHref(detail.reel.url) : undefined
  const source = safeHref(ev.source_url)
  // Quote AND rationale together (plan A6, amendment 5): the quote says what the Reel said, the
  // rationale why Astrail kept the stop. Skipped only when it is the text the card already shows.
  const rationale = ev.rationale?.trim() && ev.rationale.trim() !== provenance.text ? ev.rationale.trim() : null
  const confidence = showConfidence && detail?.confidence != null ? detail.confidence : null
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {detail?.subtitle ? (
        <p className="type-body -mt-1 pl-10 text-[14px] text-[var(--m-text-muted)]">{detail.subtitle}</p>
      ) : null}
      {extraQuotes.map((q) => (
        <p key={q} className="type-body m-subcard p-3 text-[15px] leading-snug text-[rgba(28,23,16,0.78)]">“{q}”</p>
      ))}
      <p className="type-body flex items-start gap-2 text-[14px] text-[var(--m-text-muted)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden className="mt-0.5 h-4 w-4 shrink-0">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.3" />
        </svg>
        <span>{located ? where || 'On the map' : 'Location unavailable — this stop could not be placed on the map.'}</span>
      </p>
      {rationale ? (
        <p data-rationale className="type-body text-[15px] leading-snug text-[var(--m-text)]">
          <span className="font-semibold">Why it is here: </span>{rationale}
        </p>
      ) : null}
      {confidence !== null ? (
        <p data-evidence-chip className="type-body self-start rounded-full bg-[var(--m-subcard)] px-3 py-1 text-[var(--m-text-muted)] text-[length:var(--t-meta)] leading-[1.45]">
          <span className="font-semibold text-[var(--m-accent)]">{evidenceKindLabel(ev.evidence_kind)}</span>
          <span aria-hidden> · </span>
          {confidence}% confidence
        </p>
      ) : null}
      {/* No confidence chip on a phone (it stays on desktop): the provenance line already says
          where the stop came from. The Reel, the research source and 3D are real buttons. */}
      {reel || source || (onShow3d && located) ? (
      <div className="flex flex-wrap gap-2">
      {reel ? (
        <a href={reel} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
          Watch the Reel
          <span className="sr-only"> (opens in a new tab)</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
          </svg>
        </a>
      ) : null}
      {source && source !== reel ? (
        <a href={source} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
          Source
          <span className="sr-only"> (opens in a new tab)</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
          </svg>
        </a>
      ) : null}
      {onShow3d && located ? (
        <button type="button" onClick={onShow3d} className="m-btn-secondary">
          <span aria-hidden className="font-bold tracking-[0.02em] text-[length:var(--t-meta)] leading-[1.45]">3D</span>
          Show in 3D
        </button>
      ) : null}
      </div>
      ) : null}
      {restaurants.length > 0 ? (
        <div>
          <p className="type-body mb-2 text-[14px] font-medium text-[var(--m-text)]">Places to eat nearby</p>
          <EatCardLinks
            restaurants={restaurants}
            placeIndex={placeIndex}
            selectedPlaceId={selectedRestaurantPlaceId}
            onSelect={onSelectRestaurant}
          />
        </div>
      ) : null}
    </div>
  )
}
