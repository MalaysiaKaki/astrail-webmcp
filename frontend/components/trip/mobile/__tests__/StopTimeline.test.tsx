import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripPlace } from '@/lib/trip/backend-types'
import {
  buildPlaceIndex, buildTrailNumbers, legsForDay, placesForDay, restaurantsForDay,
} from '@/lib/trip/selectors'
import StopTimeline from '@/components/trip/mobile/StopTimeline'
import { thumbnailFor } from '@/components/map/popup-model'

const index = buildPlaceIndex(TOKYO_TRIP)
const numbers = buildTrailNumbers(TOKYO_TRIP)

function renderDay(dayNumber: number, props: Partial<Parameters<typeof StopTimeline>[0]> = {}) {
  const dayId = `day_${dayNumber}`
  const onSelectPlace = vi.fn()
  const view = render(
    <StopTimeline
      bundle={TOKYO_TRIP}
      places={placesForDay(TOKYO_TRIP, dayNumber)}
      legs={legsForDay(TOKYO_TRIP, dayId)}
      restaurants={restaurantsForDay(TOKYO_TRIP, dayId)}
      placeIndex={index}
      trailNumbers={numbers}
      selectedPlaceId={null}
      onSelectPlace={onSelectPlace}
      selectedRestaurantPlaceId={null}
      onSelectRestaurant={() => {}}
      {...props}
    />,
  )
  return { ...view, onSelectPlace }
}

const row = (placeId: string) =>
  document.querySelector<HTMLElement>(`[data-place-id="${placeId}"]`)!

describe('StopTimeline', () => {
  it('shows each stop’s verbatim evidence quote in its row', () => {
    renderDay(1)
    expect(within(row('pl_akasaka')).getByText(/HARRY POTTER TRAIN STATION IN TOKYO!/)).toBeInTheDocument()
  })

  it('labels mixed provenance honestly: Reel, suggestion, and your own request', () => {
    renderDay(1)
    expect(within(row('pl_akasaka')).getByText('From a Reel')).toBeInTheDocument()
    expect(within(row('pl_ichiran')).getByText('Astrail suggestion')).toBeInTheDocument()
    expect(within(row('pl_ichiran')).getByText(/Ramen to close the sando day/)).toBeInTheDocument()
    renderDay(2)
    expect(within(row('pl_disney')).getByText('You asked for this')).toBeInTheDocument()
  })

  it('says “no caption evidence” for a Reel stop whose quote is missing', () => {
    const places = placesForDay(TOKYO_TRIP, 1).map((tp): TripPlace =>
      tp.id === 'tp_akasaka' ? { ...tp, evidence_json: { ...tp.evidence_json, quote: null, quotes: [] } } : tp)
    renderDay(1, { places })
    expect(within(row('pl_akasaka')).getByText('No caption evidence')).toBeInTheDocument()
  })

  it('prints no clock times — the trip holds none', () => {
    renderDay(1)
    expect(screen.queryByText(/\b\d{1,2}:\d{2}\b/)).toBeNull()
  })

  it('selects the place when a row is tapped, and re-selects on a second tap to re-frame', () => {
    const { onSelectPlace, rerender } = renderDay(1)
    fireEvent.click(row('pl_hpcafe'))
    expect(onSelectPlace).toHaveBeenCalledWith('pl_hpcafe')
    rerender(
      <StopTimeline
        bundle={TOKYO_TRIP} places={placesForDay(TOKYO_TRIP, 1)} legs={legsForDay(TOKYO_TRIP, 'day_1')}
        restaurants={restaurantsForDay(TOKYO_TRIP, 'day_1')} placeIndex={index} trailNumbers={numbers}
        selectedPlaceId="pl_hpcafe" onSelectPlace={onSelectPlace}
        selectedRestaurantPlaceId={null} onSelectRestaurant={() => {}}
      />,
    )
    expect(row('pl_hpcafe')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(row('pl_hpcafe'))
    expect(onSelectPlace).toHaveBeenCalledTimes(2)
  })

  it('numbers rows with the trail numbers the map pins paint', () => {
    renderDay(2)
    const painted = within(row('pl_disney')).getByText(/^\d+$/).textContent
    expect(Number(painted)).toBe(numbers.get('tp_disney'))
  })

  it('carries the cross-day no-route warning, with no duration for an unrouted leg', () => {
    renderDay(2)
    expect(screen.getByText(/long transfer/)).toBeInTheDocument()
    expect(screen.getByText(/from Ichiran Shibuya/)).toBeInTheDocument()
  })

  it('shows a duration for a routed leg', () => {
    renderDay(1)
    expect(screen.getByText(/27 min/)).toBeInTheDocument()   // leg_2: 1620 s
  })

  it('opens an unresolved stop’s detail with “location unavailable” instead of a pin promise', () => {
    const places = placesForDay(TOKYO_TRIP, 1).map((tp): TripPlace =>
      tp.id === 'tp_akasaka' ? { ...tp, place: { ...tp.place, lat: 0, lng: 0 } } : tp)
    renderDay(1, { places, selectedPlaceId: 'pl_akasaka' })
    expect(within(row('pl_akasaka').closest('li')!).getByText(/Location unavailable/)).toBeInTheDocument()
  })

  it('keeps every day restaurant suggestion reachable: unanchored in the list, anchored on its stop', () => {
    const restaurants = restaurantsForDay(TOKYO_TRIP, 'day_1')
    const nameOf = (id: string | null) => index.get(id ?? '')?.name
      ?? TOKYO_TRIP.suggestion_places.find((p) => p.id === id)?.name
    for (const r of restaurants) {
      const name = nameOf(r.restaurant_place_id)
      if (!name) continue
      const { unmount } = renderDay(1, r.near_place_id ? { selectedPlaceId: r.near_place_id } : {})
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
      unmount()
    }
    expect(restaurants.length).toBeGreaterThan(0)   // the fixture must actually pose the question
  })

  it('hints at nearby suggestions on a collapsed row so they are discoverable', () => {
    const anchored = restaurantsForDay(TOKYO_TRIP, 'day_1').find((r) => r.near_place_id)!
    renderDay(1)
    expect(within(row(anchored.near_place_id!)).getByText(/to eat nearby/)).toBeInTheDocument()
  })
})

/* A2 (Placify revamp): stops are separate cards, joined by a dotted connector that carries the
   travel leg between them. jsdom has no layout, so this pins the STRUCTURE: one connector per gap
   between consecutive cards (legs included), one above the first card only when a leg arrives into
   it from the day before, and none dangling below the last card unless a leg leaves it. This
   replaces the Phase 3 continuous-rail assertions (data-rail), which described the old list. */
describe('StopTimeline connectors', () => {
  const kinds = (el: Element) => [...el.querySelectorAll('[data-stop-card], [data-connector]')]
    .map((n) => (n.hasAttribute('data-stop-card') ? 'card' : 'link'))

  it('joins every pair of consecutive cards with exactly one connector, legs included', () => {
    renderDay(1)
    const seq = kinds(screen.getByRole('list', { name: 'Stops' }))
    const n = placesForDay(TOKYO_TRIP, 1).length
    expect(seq.filter((k) => k === 'card')).toHaveLength(n)
    expect(seq).toEqual(Array.from({ length: 2 * n - 1 }, (_, i) => (i % 2 ? 'link' : 'card')))
  })

  it('keeps the connectors when a card is expanded', () => {
    renderDay(1, { selectedPlaceId: 'pl_hpcafe' })
    const seq = kinds(screen.getByRole('list', { name: 'Stops' }))
    expect(seq.join(' ')).not.toMatch(/card card|link link/)
  })

  it('puts the arrival leg above the first card when it comes from the day before', () => {
    renderDay(2)
    expect(kinds(screen.getByRole('list', { name: 'Stops' }))[0]).toBe('link')
  })

  it('draws the connector dotted, aligned under the number badge', () => {
    renderDay(1)
    const link = document.querySelector('[data-connector]')!
    expect(link.querySelector('[data-connector-line]')!.className).toMatch(/border-dotted/)
  })
})

/* A2: the stop card itself (compare Placify appstore/02). */
describe('StopTimeline stop card', () => {
  const card = (placeId: string) => row(placeId).closest<HTMLElement>('[data-stop-card]')!

  it('is a white elevated card: ink number badge, bold title, muted category and provenance, chevron', () => {
    renderDay(1)
    expect(card('pl_akasaka').className).toMatch(/\bm-card\b/)
    const badge = row('pl_akasaka').querySelector('[data-badge]')!
    expect(badge.className).toMatch(/bg-\[var\(--m-ink\)\]/)
    expect(badge.textContent).toBe(String(numbers.get('tp_akasaka')))
    const title = within(row('pl_akasaka')).getByText('Akasaka Station')
    expect(title.className).toMatch(/font-semibold|font-bold/)
    expect(within(row('pl_akasaka')).getByText('Station')).toBeInTheDocument()
    expect(row('pl_akasaka').querySelector('.m-chevron')).not.toBeNull()
  })

  it('nests the evidence in a sub-card: the Reel thumbnail on the left, then the verbatim quote', () => {
    renderDay(1)
    const sub = row('pl_akasaka').querySelector('[data-evidence]')!
    expect(sub.className).toMatch(/\bm-subcard\b/)
    const [first, second] = [...sub.children]
    expect(first.tagName).toBe('IMG')
    expect(first.className).toMatch(/\bh-14\b/)
    expect(second.textContent).toBe('“HARRY POTTER TRAIN STATION IN TOKYO!”')
  })

  it('keeps the honest states: a suggestion shows its rationale unquoted; no quote means no sub-card', () => {
    const first = renderDay(1)
    const rationale = row('pl_ichiran').querySelector('[data-evidence]')!
    expect(rationale.textContent).toMatch(/^Ramen to close the sando day/)
    expect(rationale.textContent).not.toMatch(/[“”]/)
    first.unmount()
    // A Reel stop whose quote is missing: no sub-card (nothing is invented to fill it), and the
    // meta line says so.
    const places = placesForDay(TOKYO_TRIP, 1).map((tp): TripPlace =>
      tp.id === 'tp_akasaka' ? { ...tp, evidence_json: { ...tp.evidence_json, quote: null, quotes: [] } } : tp)
    renderDay(1, { places: places.filter((tp) => tp.id === 'tp_akasaka') })
    expect(row('pl_akasaka').querySelector('[data-evidence]')).toBeNull()
    expect(within(row('pl_akasaka')).getByText('No caption evidence')).toBeInTheDocument()
  })

  it('rings the selected card in ink and expands it inline, with Source as a secondary button', () => {
    renderDay(1, { selectedPlaceId: 'pl_ichiran' })
    expect(card('pl_ichiran').className).toMatch(/outline-\[var\(--m-ink\)\]/)
    expect(card('pl_akasaka').className).not.toMatch(/outline-\[var\(--m-ink\)\]/)
    const source = within(card('pl_ichiran')).getByRole('link', { name: /Source/ })
    expect(source.className).toMatch(/\bm-btn-secondary\b/)
    expect(source).toHaveAttribute('href', 'https://ichiran.com/')
    expect(row('pl_ichiran').querySelector('.m-chevron')!.getAttribute('class')).toMatch(/rotate-180/)
  })

  it('lists nearby places to eat on the expanded card as card links that show them on the map', () => {
    const onSelectRestaurant = vi.fn()
    renderDay(1, { selectedPlaceId: 'pl_sandolab', onSelectRestaurant, selectedRestaurantPlaceId: 'pl_popo' })
    const popo = within(card('pl_sandolab')).getByRole('button', { name: 'Show Popo on the map' })
    expect(popo.className).toMatch(/\bm-card-link\b/)
    expect(popo.querySelector('.m-chevron')).not.toBeNull()
    expect(popo).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(card('pl_sandolab')).getByRole('button', { name: 'Show Ichiran Shibuya on the map' }))
    expect(onSelectRestaurant).toHaveBeenCalledWith('pl_ichiran')
  })

  it('shows a travel leg as a meta row: mode icon, then "3 min · 0.1 km"', () => {
    renderDay(1)
    const legs = [...document.querySelectorAll('[data-leg="routed"]')]
    expect(legs.map((l) => l.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Walk 3 min · 0.1 km', 'Drive 27 min · 9.5 km'])
    expect(legs.map((l) => l.querySelector('svg')!.getAttribute('data-mode'))).toEqual(['walk', 'drive'])
    // The mode word is for assistive tech; on screen the icon says it.
    expect(within(legs[0] as HTMLElement).getByText('Walk').className).toMatch(/sr-only/)
  })

  it('makes the day-level "Where to eat" suggestions card links too', () => {
    const restaurants = restaurantsForDay(TOKYO_TRIP, 'day_1')
    renderDay(1, { places: [], restaurants })
    const links = within(screen.getByRole('heading', { name: 'Where to eat' }).parentElement!).getAllByRole('button')
    expect(links.length).toBe(restaurants.length)
    for (const l of links) expect(l.className).toMatch(/\bm-card-link\b/)
  })
})

/* Codex #2: a selection that arrives from outside the list (a map pin, show_on_map) must bring
   its stop into view in the phone scroller, as the desktop list already does. */
describe('StopTimeline selection visibility', () => {
  it('scrolls the newly selected stop into view', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { rerender } = renderDay(1)
    spy.mockClear()
    rerender(
      <StopTimeline
        bundle={TOKYO_TRIP} places={placesForDay(TOKYO_TRIP, 1)} legs={legsForDay(TOKYO_TRIP, 'day_1')}
        restaurants={restaurantsForDay(TOKYO_TRIP, 'day_1')} placeIndex={index} trailNumbers={numbers}
        selectedPlaceId="pl_ichiran" onSelectPlace={() => {}}
        selectedRestaurantPlaceId={null} onSelectRestaurant={() => {}}
      />,
    )
    expect(spy).toHaveBeenCalled()
    const target = spy.mock.contexts.at(-1) as Element
    expect(target.querySelector('[data-place-id="pl_ichiran"]')).not.toBeNull()
    // Aligned to the TOP of the scroller (with a small scroll-margin), not 'nearest', which left
    // the previous stop half-cut above it.
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ block: 'start' })
    expect(target.className).toMatch(/scroll-mt-/)
    spy.mockRestore()
  })

  it('keeps a tapped row where the finger is: nearest, not snapped to the top', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const onSelectPlace = vi.fn()
    const ui = (sel: string | null) => (
      <StopTimeline
        bundle={TOKYO_TRIP} places={placesForDay(TOKYO_TRIP, 1)} legs={legsForDay(TOKYO_TRIP, 'day_1')}
        restaurants={restaurantsForDay(TOKYO_TRIP, 'day_1')} placeIndex={index} trailNumbers={numbers}
        selectedPlaceId={sel} onSelectPlace={onSelectPlace}
        selectedRestaurantPlaceId={null} onSelectRestaurant={() => {}}
      />
    )
    const { rerender } = render(ui(null))
    fireEvent.click(row('pl_sandolab'))
    spy.mockClear()
    rerender(ui('pl_sandolab'))                   // the parent echoes the tap back as a selection
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ block: 'nearest' })
    spy.mockRestore()
  })
})

/* Codex #4: a day with no scheduled stops can still have restaurant suggestions; desktop shows
   them in its separate strip, so the phone list must not return before "Where to eat". */
describe('StopTimeline on a day with no stops', () => {
  it('says there are no stops AND keeps the day restaurant suggestions reachable', () => {
    const restaurants = restaurantsForDay(TOKYO_TRIP, 'day_1')
    expect(restaurants.length).toBeGreaterThan(0)   // the fixture must pose the question
    renderDay(1, { places: [], restaurants })
    expect(screen.getByText(/No stops planned for this day/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where to eat' })).toBeInTheDocument()
    for (const r of restaurants) {
      const name = index.get(r.restaurant_place_id ?? '')?.name
        ?? TOKYO_TRIP.suggestion_places.find((p) => p.id === r.restaurant_place_id)?.name
      if (name) expect(screen.getByText(name)).toBeInTheDocument()
    }
  })
})


/* Phase 7 polish (phones). */
describe('StopTimeline row polish', () => {
  it('shows the Reel thumbnail the map pin uses, and no placeholder art when there is none', () => {
    renderDay(1)
    const akasaka = TOKYO_TRIP.places.find((p) => p.id === 'tp_akasaka')!
    const src = thumbnailFor(TOKYO_TRIP, akasaka)
    expect(src).toBeTruthy()                                  // the fixture must pose the question
    const img = row('pl_akasaka').querySelector('img')!
    expect(img.getAttribute('src')).toBe(src)            // the same source the pin's photo uses
    expect(img).toHaveAttribute('alt', '')
    const ichiran = TOKYO_TRIP.places.find((p) => p.id === 'tp_ichiran')!
    expect(thumbnailFor(TOKYO_TRIP, ichiran)).toBeNull()
    expect(row('pl_ichiran').querySelector('img')).toBeNull()
    expect(row('pl_ichiran').querySelector('[data-cover="none"]')).toBeNull()
  })

  it('keeps the quote verbatim but quiet: not italic, not transformed, clamped to two lines', () => {
    renderDay(1)
    const quote = within(row('pl_akasaka')).getByText(/HARRY POTTER TRAIN STATION IN TOKYO!/)
    expect(quote.textContent).toBe('“HARRY POTTER TRAIN STATION IN TOKYO!”')
    expect(quote.className).not.toMatch(/\bitalic\b/)
    expect(quote.className).not.toMatch(/uppercase|lowercase|capitalize/)
    expect(quote.className).toMatch(/line-clamp-2/)
  })

  it('drops the confidence chip from an expanded stop but keeps its address', () => {
    renderDay(1, { selectedPlaceId: 'pl_akasaka' })
    const li = row('pl_akasaka').closest('li')!
    expect(within(li).queryByText('65%')).toBeNull()
    expect(within(li).getByText(/Akasaka, Tokyo/)).toBeInTheDocument()
  })

  it('renders a no-route leg as one compact line with a transit icon', () => {
    renderDay(2)
    const leg = document.querySelector('[data-leg="no-route"]')!
    expect(leg).not.toBeNull()
    expect(leg.querySelector('svg')).not.toBeNull()
    expect(leg.querySelector('.truncate')).not.toBeNull()          // one line, ellipsised
    expect(leg.textContent).toMatch(/from Ichiran Shibuya/)
    expect(leg.textContent).toMatch(/long transfer/)
    expect(leg.textContent).not.toMatch(/v1/)
  })
})

describe('StopTimeline thumbnail safety', () => {
  it('refuses a non-http thumbnail (Reel data is untrusted) and shows no image', () => {
    const hostile = { ...TOKYO_TRIP, inspiration: TOKYO_TRIP.inspiration.map((i) => ({ ...i, thumbnail_url: 'javascript:alert(1)' })) }
    render(
      <StopTimeline
        bundle={hostile} places={placesForDay(TOKYO_TRIP, 1)} legs={[]} restaurants={[]}
        placeIndex={index} trailNumbers={numbers} selectedPlaceId={null} onSelectPlace={() => {}}
        selectedRestaurantPlaceId={null} onSelectRestaurant={() => {}}
      />,
    )
    expect(row('pl_akasaka').querySelector('img')).toBeNull()
  })
})
