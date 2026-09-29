/* The two optional StopTimeline props the ChatGPT widget relies on (Codex round 4 F1, F2). The
   app's own behaviour with a map — eat cards as "Show X on the map" buttons, "No caption evidence"
   for a quote-less Reel stop — stays pinned in StopTimeline.test.tsx; these cover the omissions. */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripPlace } from '@/lib/trip/backend-types'
import {
  buildPlaceIndex, buildTrailNumbers, legsForDay, placesForDay, restaurantsForDay,
} from '@/lib/trip/selectors'
import StopTimeline from '@/components/trip/mobile/StopTimeline'

const index = buildPlaceIndex(TOKYO_TRIP)
const numbers = buildTrailNumbers(TOKYO_TRIP)

/** Day 1 with NO onSelectRestaurant: the no-map configuration. */
function renderNoMap(props: Partial<Parameters<typeof StopTimeline>[0]> = {}) {
  return render(
    <StopTimeline
      bundle={TOKYO_TRIP}
      places={placesForDay(TOKYO_TRIP, 1)}
      legs={legsForDay(TOKYO_TRIP, 'day_1')}
      restaurants={restaurantsForDay(TOKYO_TRIP, 'day_1')}
      placeIndex={index}
      trailNumbers={numbers}
      selectedPlaceId={null}
      onSelectPlace={() => {}}
      selectedRestaurantPlaceId={null}
      {...props}
    />,
  )
}

const card = (placeId: string) =>
  document.querySelector<HTMLElement>(`[data-place-id="${placeId}"]`)!.closest<HTMLElement>('[data-stop-card]')!

function expectPlainEatCards(scope: HTMLElement) {
  const cards = [...scope.querySelectorAll<HTMLElement>('[data-eat-card]')]
  expect(cards.length).toBeGreaterThan(0)
  for (const c of cards) {
    expect(within(c).queryByRole('button')).toBeNull()            // no inert control
    expect(c.querySelector('.m-chevron')).toBeNull()              // no "go somewhere" chevron
    expect(c.className).toMatch(/\bm-subcard\b/)                  // flat: not the tappable elevation
    expect(c.className).not.toMatch(/\bm-card\b/)
  }
  expect(within(scope).queryByRole('button', { name: /on the map/ })).toBeNull()
}

describe('StopTimeline without a map (no onSelectRestaurant)', () => {
  it('renders an expanded stop\'s places to eat as plain cards that keep their Evidence link', () => {
    renderNoMap({ selectedPlaceId: 'pl_sandolab' })
    const stop = card('pl_sandolab')
    expectPlainEatCards(stop)
    expect(within(stop).getByText('Ichiran Shibuya')).toBeInTheDocument()
    expect(within(stop).getByRole('link', { name: /Evidence/ })).toHaveAttribute('href', 'https://ichiran.com/')
  })

  it('renders the day-level "Where to eat" list as plain cards too', () => {
    const restaurants = restaurantsForDay(TOKYO_TRIP, 'day_1')
    renderNoMap({ places: [], restaurants })
    const section = screen.getByRole('heading', { name: 'Where to eat' }).parentElement!
    expectPlainEatCards(section)
    expect(section.querySelectorAll('[data-eat-card]')).toHaveLength(restaurants.length)
  })
})

describe('StopTimeline with captions omitted from a bounded view', () => {
  const quoteless = placesForDay(TOKYO_TRIP, 1).map((tp): TripPlace =>
    tp.id === 'tp_akasaka' ? { ...tp, evidence_json: { ...tp.evidence_json, quote: null, quotes: [] } } : tp)
  const row = () => document.querySelector<HTMLElement>('[data-place-id="pl_akasaka"]')!

  it('says the caption is not included in this view instead of "No caption evidence"', () => {
    renderNoMap({ places: quoteless, captionsOmitted: true })
    expect(within(row()).getByText('Caption not included in this view')).toBeInTheDocument()
    expect(within(row()).queryByText('No caption evidence')).toBeNull()
  })

  it('keeps "No caption evidence" when nothing was omitted (control)', () => {
    renderNoMap({ places: quoteless })
    expect(within(row()).getByText('No caption evidence')).toBeInTheDocument()
  })

  it('says the same in the desktop rows variant', () => {
    renderNoMap({ places: quoteless, captionsOmitted: true, variant: 'rows' })
    expect(within(row()).getByText('Caption not included in this view')).toBeInTheDocument()
  })
})
