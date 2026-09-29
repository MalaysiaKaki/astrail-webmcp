'use client'

import type { TripBundle } from '@/lib/trip/backend-types'
import { buildPlaceIndex, findTripPlace, hasRealCoords } from '@/lib/trip/selectors'
import { stopProvenance } from '@/lib/trip/stop-provenance'
import { anchoredEats, stopSequence } from '@/lib/trip/place-card'
import { buildPopupModel, thumbnailFor } from '@/components/map/popup-model'
import { safeHref } from '@/lib/safe-href'
import EatCardLinks from '../mobile/EatCardLinks'
import { CardEvidence, ConfidenceChip, humanize, StopActions, WhereLine } from '../mobile/StopParts'
import PlaceCardShell, { CardDisclosure, CardLink, type CardCloseReason } from './PlaceCardShell'

/** Rows of "Places to eat nearby" on the card; the rest are one "See all" away in the sidebar. */
const EATS_ON_CARD = 3

export type StopPlaceCardProps = {
  bundle: TripBundle
  placeId: string
  onClose: (reason: CardCloseReason) => void
  /** Prev/next: reveal that stop (its day, its row, its card). */
  onNavigate: (placeId: string) => void
  onShow3d?: () => void
  /** An eat row: that suggestion's own card, at its pin. */
  onSelectEat: (restaurantPlaceId: string) => void
  /** "See all N": the Trip tab at that day, scrolled to its places to eat. */
  onSeeAllEats: (dayNumber: number) => void
  /** "Day N overview": the Trip tab at that day, its overview opened. */
  onDayOverview: (dayNumber: number) => void
  /** Read this detail in the sidebar instead (keyboard users, narrow maps). */
  onDetailsHere: () => void
}

/**
 * A stop's detail at its pin on the desktop map (A10; Shaun: "the map looked empty with everything
 * in the sidebar"). The same content as the sidebar's expanded stop card, from the same parts
 * (mobile/StopParts), read from the CURRENT bundle on every render: Stop N of M in the pins'
 * journey order, the Reel still and verbatim quote, where, confidence (never for a requested
 * stop), Watch the Reel / Source / Show in 3D, why it is here, more quotes and the local name as
 * disclosures, the eats anchored to this stop, and the way back into the day's overview.
 */
export default function StopPlaceCard(p: StopPlaceCardProps) {
  const tp = findTripPlace(p.bundle, p.placeId)
  if (!tp) return null
  const seq = stopSequence(p.bundle, tp.place_id)
  const provenance = stopProvenance(tp)
  const model = buildPopupModel(p.bundle, tp)
  const ev = tp.evidence_json
  const located = hasRealCoords(tp.place.lng, tp.place.lat)
  const rationale = ev.rationale?.trim() && ev.rationale.trim() !== provenance.text ? ev.rationale.trim() : null
  const extraQuotes = ev.quotes.filter((q) => q.trim() && q !== ev.quote)
  const eats = anchoredEats(p.bundle, tp)
  const shown = eats.near.slice(0, EATS_ON_CARD)
  const day = tp.day_number
  return (
    <PlaceCardShell
      label="stop"
      meta={seq ? `Stop ${seq.number} of ${seq.total} · Day ${seq.day}` : day !== null ? `Day ${day}` : 'Not on a day'}
      title={tp.place.name}
      subtitle={(
        <>
          <span>{humanize(tp.place.place_type)}</span>
          <span aria-hidden> · </span>
          <span className={provenance.kind === 'none' ? '' : 'font-medium text-[var(--m-accent)]'}>{provenance.label}</span>
        </>
      )}
      nav={seq ? {
        prev: seq.prev ? () => p.onNavigate(seq.prev!) : null,
        next: seq.next ? () => p.onNavigate(seq.next!) : null,
      } : null}
      onClose={p.onClose}
    >
      <CardEvidence p={provenance} thumbnail={thumbnailFor(p.bundle, tp)} />
      <WhereLine tp={tp} located={located} />
      {model.confidence !== null ? <ConfidenceChip tp={tp} confidence={model.confidence} /> : null}
      <StopActions
        reel={model.reel ? safeHref(model.reel.url) : undefined}
        source={safeHref(ev.source_url)}
        onShow3d={p.onShow3d && located ? p.onShow3d : undefined}
      />
      {rationale || extraQuotes.length || model.subtitle ? (
        <div className="flex flex-col">
          {rationale ? (
            <CardDisclosure summary="Why it's here">
              <p data-rationale className="t-body leading-snug text-[var(--m-text)]">{rationale}</p>
            </CardDisclosure>
          ) : null}
          {extraQuotes.length ? (
            <CardDisclosure summary={`${extraQuotes.length} more ${extraQuotes.length === 1 ? 'quote' : 'quotes'} from the Reel`}>
              {extraQuotes.map((q) => (
                <p key={q} className="t-body m-subcard p-3 leading-snug text-[rgba(28,23,16,0.78)]">“{q}”</p>
              ))}
            </CardDisclosure>
          ) : null}
          {model.subtitle ? (
            <CardDisclosure summary="Local name">
              <p className="t-body text-[var(--m-text)]">{model.subtitle}</p>
            </CardDisclosure>
          ) : null}
        </div>
      ) : null}
      {shown.length > 0 ? (
        <section aria-label="Places to eat nearby" className="flex flex-col gap-2">
          <h3 className="t-body font-semibold text-[var(--m-text)]">Places to eat nearby</h3>
          <EatCardLinks restaurants={shown} placeIndex={buildPlaceIndex(p.bundle)} selectedPlaceId={null} onSelect={p.onSelectEat} />
        </section>
      ) : null}
      {day !== null && eats.dayTotal > shown.length ? (
        <CardLink onClick={() => p.onSeeAllEats(day)}>
          See all {eats.dayTotal} places to eat on Day {day}
        </CardLink>
      ) : null}
      <div className="flex flex-col gap-2">
        {day !== null ? <CardLink onClick={() => p.onDayOverview(day)}>Day {day} overview</CardLink> : null}
        <CardLink onClick={p.onDetailsHere}>Details in the sidebar</CardLink>
      </div>
    </PlaceCardShell>
  )
}
