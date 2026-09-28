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

/* The rail is one continuous line from the first dot to the last (Grab-style). jsdom has no
   layout, so this pins the STRUCTURE: every segment between the first and last dot draws line,
   legs sit on it, and only the outer ends are capped. */
describe('StopTimeline rail', () => {
  const segs = (el: Element) => [...el.querySelectorAll('[data-rail]')].map((s) => s.getAttribute('data-rail'))

  it('draws line through every segment between the first and last dot, legs included', () => {
    renderDay(1)
    const all = segs(screen.getByRole('list', { name: 'Stops' }))
    const first = all.indexOf('dot')
    const last = all.lastIndexOf('dot')
    expect(all.slice(0, first)).toEqual(['cap'])                 // nothing above stop 1
    expect(all.slice(first + 1, last).every((s) => s === 'line' || s === 'dot')).toBe(true)
    expect(all.slice(last + 1)).toEqual(['cap'])                  // nothing below the last stop
    expect(all.filter((s) => s === 'dot')).toHaveLength(placesForDay(TOKYO_TRIP, 1).length)
  })

  it('keeps the line running through an expanded stop into the next one', () => {
    renderDay(1, { selectedPlaceId: 'pl_hpcafe' })
    const all = segs(screen.getByRole('list', { name: 'Stops' }))
    const first = all.indexOf('dot')
    const last = all.lastIndexOf('dot')
    expect(all.slice(first + 1, last).every((s) => s === 'line' || s === 'dot')).toBe(true)
  })

  it('starts the line above stop 1 when a leg arrives into it from the day before', () => {
    renderDay(2)
    const all = segs(screen.getByRole('list', { name: 'Stops' }))
    expect(all[0]).toBe('line')     // the cross-day arrival sits on the rail above the dot
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
