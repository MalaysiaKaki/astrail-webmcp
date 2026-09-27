import type { Place, TransportLeg, TripPlace } from '@/lib/trip/backend-types'

export type RouteLink = {
  leg: TransportLeg
  /* Where you are setting off from, but ONLY when the reader cannot already see it. Between two
     stops on this list the origin is the card directly above, and repeating it is noise. */
  from: string | null
}

/* One rule — "the leg that BRINGS you to this stop" — and it covers both shapes the data takes:
   the hop between two stops on this day, and the arrival into the day's first stop from
   yesterday's last one. The second case is not hypothetical: in the demo trip, the last day's
   only leg sets off from the day before, so a fold that matched consecutive pairs alone would
   silently drop that day's routing warning. Anything still unclaimed (a leg leaving the last
   stop, an unresolved endpoint) trails the list rather than vanishing — this fold is the only
   place the legs are shown.

   Shared by the desktop itinerary (ItineraryCards) and the phone timeline (StopTimeline), so both
   read the same directions. The demo trip supplying that shape is asserted in
   `lib/trip/__tests__/tokyo-trip.test.ts`:
   the day boundary was moved once (three days consolidated to two), and a boundary that leaves no
   leg spanning two days would let lib/trip/__tests__/route-links.test.ts go on passing while
   watching nothing. */
export function buildRouteLinks(
  places: TripPlace[], legs: TransportLeg[], placeIndex?: Map<string, Place>,
): { above: (RouteLink | null)[]; trailing: RouteLink[] } {
  const claimed = new Set<string>()
  const nameOf = (id: string | null) => (id ? placeIndex?.get(id)?.name ?? null : null)
  const above = places.map((tp, i) => {
    const leg = legs.find((l) => l.to_place_id === tp.place_id && !claimed.has(l.id))
    if (!leg) return null
    claimed.add(leg.id)
    const fromVisibleAbove = i > 0 && leg.from_place_id === places[i - 1].place_id
    return { leg, from: fromVisibleAbove ? null : nameOf(leg.from_place_id) }
  })
  const trailing = legs
    .filter((l) => !claimed.has(l.id))
    .map((leg) => ({ leg, from: nameOf(leg.from_place_id) }))
  return { above, trailing }
}
