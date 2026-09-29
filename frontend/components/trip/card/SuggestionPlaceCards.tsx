'use client'

import type { TripBundle } from '@/lib/trip/backend-types'
import { buildPlaceIndex, findTripPlace } from '@/lib/trip/selectors'
import { eatFacts, stayFacts } from '@/components/map/suggestion-popup'
import { openCardEntity } from '@/lib/trip/place-card'
import PlaceCardShell, { CardLink, type CardCloseReason } from './PlaceCardShell'

const EXTERNAL = 'M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4'

/**
 * A "where to eat" suggestion at its pin: the stop card's family (A10), stating exactly what the
 * phone's DOM card states (suggestion-popup's eatFacts): no invented hours, no centroid distance
 * dressed as distance from the stop. "Near" is the stop it was anchored to, and opens that stop.
 */
export function EatPlaceCard({ bundle, placeId, onClose, onOpenStop, inline = false }: {
  bundle: TripBundle
  placeId: string
  /** Shown in the sidebar instead of at the pin. */
  inline?: boolean
  onClose: (reason: CardCloseReason) => void
  onOpenStop: (placeId: string) => void
}) {
  const e = openCardEntity(bundle, { kind: 'eat', id: placeId, nonce: 0 })
  if (!e || e.kind !== 'eat') return null
  const r = e.suggestion
  const near = r.near_place_id ? findTripPlace(bundle, r.near_place_id) : null
  const f = eatFacts(r, e.place, null)
  const evidence = r.source_url && r.source_url !== f.link ? eatFacts({ ...r, evidence_json: {} }, e.place).link : null
  return (
    <PlaceCardShell inline={inline} label="place to eat" meta={f.eyebrow} title={f.title} subtitle={f.where} onClose={onClose}>
      {f.summary ? <p className="t-body leading-snug text-[var(--m-text)]">{f.summary}</p> : null}
      {f.hours ? <p className="t-meta">{f.hours}</p> : null}
      {f.link || evidence ? (
        <div className="flex flex-wrap gap-2">
          {f.link ? <ExternalLink href={f.link}>More about this place</ExternalLink> : null}
          {evidence ? <ExternalLink href={evidence}>Evidence</ExternalLink> : null}
        </div>
      ) : null}
      {near ? <CardLink onClick={() => onOpenStop(near.place_id)}>Near {near.place.name}</CardLink> : null}
    </PlaceCardShell>
  )
}

/** A hotel hub at its pin: class, guest score, price, cancellation, and that it is not an offer. */
export function HotelPlaceCard({ bundle, hotelId, onClose, inline = false }: {
  bundle: TripBundle
  hotelId: string
  /** Shown in the Stay view instead of at the pin. */
  inline?: boolean
  onClose: (reason: CardCloseReason) => void
}) {
  const e = openCardEntity(bundle, { kind: 'hotel', id: hotelId, nonce: 0 })
  if (!e || e.kind !== 'hotel') return null
  const f = stayFacts(e.hotel)
  const base = e.hotel.base_place_id ? buildPlaceIndex(bundle).get(e.hotel.base_place_id) : null
  return (
    <PlaceCardShell inline={inline} label="hotel" meta={f.eyebrow} title={f.title} subtitle={f.area ?? base?.area ?? null} onClose={onClose}>
      <ul className="flex flex-col gap-1">
        {[f.stars, f.guest, f.price, f.cancellation].filter(Boolean).map((line) => (
          <li key={line} className="t-body text-[var(--m-text)]">{line}</li>
        ))}
      </ul>
      <p className="t-meta">{f.note}</p>
    </PlaceCardShell>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden className="h-4 w-4"><path d={EXTERNAL} /></svg>
    </a>
  )
}
