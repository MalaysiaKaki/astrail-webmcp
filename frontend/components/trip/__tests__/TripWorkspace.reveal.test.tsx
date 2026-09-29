import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'

/* Codex final-review fix 1: a selected place outside the active day's list (an undayed base
   hotel) had no detail surface on desktop once the map popup was retired. It now gets a pinned
   "Selected place" card at the top of the itinerary, built from the same StopDetail model. */

const { MapCtor, mapInstance, mapProps } = vi.hoisted(() => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const mapInstance = {
    on: vi.fn(), setConfigProperty: vi.fn(),
    remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  return {
    MapCtor: vi.fn(() => mapInstance), mapInstance,
    mapProps: { current: null as null | { onSelectPlace: (id: string) => void; show3dNonce?: number; mode3d?: boolean } },
  }
})

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', () => ({
  default: (props: { onSelectPlace: (id: string) => void }) => {
    mapProps.current = props
    return <div data-testid="trip-map" />
  },
}))
vi.mock('mapbox-gl', () => ({
  default: { Map: MapCtor, Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}))
vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function mount(bundle: TripBundle = TOKYO_TRIP_WITH_HOTELS) {
  const view = render(
    <MapProvider>
      <TripWorkspace tripId={bundle.trip.id} bundle={bundle} readOnly />
    </MapProvider>,
  )
  return view
}

const card = (id: string) => document.querySelector(`[data-trip-scroll] [data-place-id="${id}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN })

describe('an undayed selected place (fix 1)', () => {
  it('gets a pinned "Selected place" card with its detail and Show in 3D', async () => {
    mount()
    await flush()
    expect(screen.queryByRole('region', { name: 'Selected place' })).toBeNull()
    await act(async () => { mapProps.current!.onSelectPlace('pl_hotelbase') })
    const region = screen.getByRole('region', { name: 'Selected place' })
    expect(within(region).getByText('Shinjuku Granbell Hotel')).toBeInTheDocument()
    // The StopDetail model: the rationale and the 3D button.
    expect(within(region).getByText(/Central Shinjuku base suggested/)).toBeInTheDocument()
    const show3d = within(region).getByRole('button', { name: /Show in 3D/ })
    await act(async () => { show3d.click() })
    expect(mapProps.current!.mode3d).toBe(true)
    expect(mapProps.current!.show3dNonce).toBe(1)
    // The day list is unchanged: day 1's stops are still there below it.
    expect(card(placesForDay(TOKYO_TRIP, 1)[0].place_id)).not.toBeNull()
  })

  it('does not duplicate a place that IS on the active day\'s list', async () => {
    mount()
    await flush()
    const day1 = placesForDay(TOKYO_TRIP, 1)[0]
    await act(async () => { mapProps.current!.onSelectPlace(day1.place_id) })
    expect(screen.queryByRole('region', { name: 'Selected place' })).toBeNull()
    expect(card(day1.place_id)).toHaveAttribute('aria-current', 'true')
  })
})
