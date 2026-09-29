'use client'

import type { Place, RestaurantSuggestion, TripPlace } from '@/lib/trip/backend-types'
import { hasRealCoords } from '@/lib/trip/selectors'
import type { StopProvenance } from '@/lib/trip/stop-provenance'
import { safeHref } from '@/lib/safe-href'
import type { PopupModel } from '@/components/map/popup-model'
import EatCardLinks from './EatCardLinks'
import { ConfidenceChip, Evidence, humanize, provenanceLabel, StopActions, WhereLine } from './StopParts'

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
  detail = null, showConfidence = false, onShow3d, captionOmitted = false,
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
  /** Omitted where there is no map: the places to eat render as plain cards (EatCardLinks). */
  onSelectRestaurant?: (placeId: string) => void
  /** The caption was cut from a bounded view (the ChatGPT widget's truncated.quotes): a stop with
   *  no quote says so instead of claiming the Reel had no caption evidence. */
  captionOmitted?: boolean
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
              <span className={p.kind === 'none' ? '' : 'font-medium text-[var(--m-accent)]'}>{provenanceLabel(p, captionOmitted)}</span>
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
  onSelectRestaurant?: (placeId: string) => void
}) {
  const { place, evidence_json: ev } = tp
  const located = hasRealCoords(place.lng, place.lat)
  const extraQuotes = ev.quotes.filter((q) => q.trim() && q !== ev.quote)
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
      <WhereLine tp={tp} located={located} />
      {rationale ? (
        <p data-rationale className="type-body text-[15px] leading-snug text-[var(--m-text)]">
          <span className="font-semibold">Why it is here: </span>{rationale}
        </p>
      ) : null}
      {confidence !== null ? <ConfidenceChip tp={tp} confidence={confidence} /> : null}
      {/* No confidence chip on a phone (it stays on desktop): the provenance line already says
          where the stop came from. The Reel, the research source and 3D are real buttons. */}
      <StopActions reel={reel} source={source} onShow3d={onShow3d && located ? onShow3d : undefined} />
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
