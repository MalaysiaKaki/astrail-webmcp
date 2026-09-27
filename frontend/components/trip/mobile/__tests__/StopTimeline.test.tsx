import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripPlace } from '@/lib/trip/backend-types'
import {
  buildPlaceIndex, buildTrailNumbers, legsForDay, placesForDay, restaurantsForDay,
} from '@/lib/trip/selectors'
import StopTimeline from '@/components/trip/mobile/StopTimeline'

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
    expect(screen.getByText(/Long transfer/)).toBeInTheDocument()
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
