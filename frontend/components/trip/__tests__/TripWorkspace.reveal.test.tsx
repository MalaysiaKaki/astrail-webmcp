import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'

/* Codex final-review fix 1: a selected place outside the active day's list (an undayed base
   hotel) had no detail surface on desktop once the map popup was retired. It now gets a pinned
   "Selected place" card at the top of the itinerary, built from the same StopDetail model. */

const { MapCtor, mapInstance, mapProps, toolProps } = vi.hoisted(() => {
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
    toolProps: { current: null as null | Record<string, unknown> },
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
// Captures the setters TripWorkspace hands its page tools, so the REAL show_on_map can run on them.
vi.mock('@/components/webmcp/TripTools', () => ({
  default: (props: Record<string, unknown>) => { toolProps.current = props; return null },
}))
vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

import { showOnMapTool, type MapDeps } from '@/lib/webmcp/tools/map'
import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

async function flush() {
  // Long enough for one animation frame: the reveal scrolls in the frame after the card mounts.
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
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

/** The real show_on_map tool, driven through the setters the workspace hands TripTools. */
function showOnMap(args: Record<string, unknown>) {
  const t = toolProps.current as unknown as Omit<MapDeps, 'bundle' | 'view'> & { bundle: TripBundle }
  const tool = showOnMapTool({ ...t, bundle: () => t.bundle, view: () => null })
  return act(async () => { await tool.execute(args) })
}

const hidePanel = () => screen.getByRole('button', { name: 'Hide trip details and show the full map' })
const panel = () => document.getElementById('trip-details-panel')!
const stayChip = () => screen.getByRole('button', { name: 'Stay' })
const openTab = (name: string) => act(async () => { screen.getByRole('tab', { name }).click() })

describe('revealPlace (amendment 5)', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/app/trip/demo'); window.sessionStorage.clear() })

  it('a map pin on another day opens that day, with the card in view', async () => {
    mount()
    await flush()
    const lastDay = TOKYO_TRIP.days.at(-1)!.day_number!
    const stop = placesForDay(TOKYO_TRIP, lastDay)[0]
    expect(card(stop.place_id)).toBeNull()
    await act(async () => { mapProps.current!.onSelectPlace(stop.place_id) })
    await flush()
    expect(card(stop.place_id)).toHaveAttribute('aria-current', 'true')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('reopens a collapsed panel', async () => {
    mount()
    await flush()
    await act(async () => { hidePanel().click() })
    expect(panel()).toHaveAttribute('inert')
    await act(async () => { mapProps.current!.onSelectPlace(placesForDay(TOKYO_TRIP, 2)[0].place_id) })
    expect(panel()).not.toHaveAttribute('inert')
  })

  it('leaves the Stay list for the stops', async () => {
    mount()
    await flush()
    await act(async () => { stayChip().click() })
    expect(screen.getByText('Where to stay')).toBeInTheDocument()
    const stop = placesForDay(TOKYO_TRIP, 1)[1]
    await act(async () => { mapProps.current!.onSelectPlace(stop.place_id) })
    expect(screen.queryByText('Where to stay')).toBeNull()
    expect(card(stop.place_id)).toHaveAttribute('aria-current', 'true')
  })

  it('a repeated pin click brings the card into view again', async () => {
    mount()
    await flush()
    const stop = placesForDay(TOKYO_TRIP, 1)[0]
    const spy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    await act(async () => { mapProps.current!.onSelectPlace(stop.place_id) })
    await flush()
    const after1 = spy.mock.calls.length
    await act(async () => { mapProps.current!.onSelectPlace(stop.place_id) })
    await flush()
    expect(spy.mock.calls.length).toBeGreaterThan(after1)
  })

  it('switches to the Trip tab from a ?tab= deep link, and drops the param', async () => {
    window.history.replaceState(null, '', '/app/trip/demo?tab=build')
    mount()
    await flush()
    expect(window.location.search).toBe('?tab=build')
    await act(async () => { mapProps.current!.onSelectPlace(placesForDay(TOKYO_TRIP, 2)[0].place_id) })
    expect(window.location.search).toBe('')
    expect(window.sessionStorage.getItem(`astrail:trip-tab:${TOKYO_TRIP_WITH_HOTELS.trip.id}`)).toBe('trip')
  })

  it('ignores a place that is not on the trip', async () => {
    mount()
    await flush()
    await act(async () => { hidePanel().click() })
    await act(async () => { mapProps.current!.onSelectPlace('pl_nowhere') })
    expect(panel()).toHaveAttribute('inert')
  })
})

describe('show_on_map drives the same reveal (amendments 5 and 10)', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/app/trip/demo?tab=for-you'); window.sessionStorage.clear() })

  it('place: its day, the Trip tab, the panel reopened, the card in view', async () => {
    mount()
    await flush()
    await act(async () => { hidePanel().click() })
    const lastDay = TOKYO_TRIP.days.at(-1)!.day_number!
    const stop = placesForDay(TOKYO_TRIP, lastDay)[0]
    await showOnMap({ target: 'place', place: stop.place.name })
    expect(panel()).not.toHaveAttribute('inert')
    expect(window.location.search).toBe('')
    expect(card(stop.place_id)).toHaveAttribute('aria-current', 'true')
  })

  it('day: the Trip tab and that day\'s list, from Stay', async () => {
    mount()
    await flush()
    await openTab('Trip')
    await act(async () => { stayChip().click() })
    await openTab('For you')
    await showOnMap({ target: 'day', day: 2 })
    expect(window.location.search).toBe('')
    expect(screen.queryByText('Where to stay')).toBeNull()
    expect(card(placesForDay(TOKYO_TRIP, 2)[0].place_id)).not.toBeNull()
  })

  it('trip: the Trip tab and the stops list, from Stay', async () => {
    mount()
    await flush()
    await openTab('Trip')
    await act(async () => { stayChip().click() })
    await openTab('How it was built')
    await showOnMap({ target: 'trip' })
    expect(window.location.search).toBe('')
    expect(screen.queryByText('Where to stay')).toBeNull()
  })

  it('hotel_hub: the Trip tab and the Stay view', async () => {
    mount()
    await flush()
    await act(async () => { hidePanel().click() })
    await showOnMap({ target: 'hotel_hub' })
    expect(panel()).not.toHaveAttribute('inert')
    expect(window.location.search).toBe('')
    expect(screen.getByText('Where to stay')).toBeInTheDocument()
  })
})

describe('the panel tabs (plan v2 §2, amendment 9)', () => {
  const KEY = `astrail:trip-tab:${TOKYO_TRIP_WITH_HOTELS.trip.id}`
  beforeEach(() => { window.history.replaceState(null, '', '/app/trip/demo'); window.sessionStorage.clear() })
  const selected = () => screen.getByRole('tab', { selected: true }).textContent

  it('opens on Trip with the hero, the tabs and the Trip tab\'s day card and weather', async () => {
    mount()
    await flush()
    expect(selected()).toBe('Trip')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', 'trip-tab-trip')
    expect(within(panel).getByTestId('day-header-card')).toBeInTheDocument()
    expect(within(panel).getByTestId('weather-chip')).toHaveTextContent('31°C · 55% rain')
    expect(screen.getByTestId('trip-hero')).toBeInTheDocument()
  })

  it('a tab change rewrites ?tab= with replaceState and remembers it for this trip', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    mount()
    await flush()
    await openTab('How it was built')
    expect(window.location.search).toBe('?tab=build')
    expect(window.sessionStorage.getItem(KEY)).toBe('build')
    expect(screen.getByTestId('build-interim')).toBeInTheDocument()
    await openTab('Trip')
    expect(window.location.search).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('the URL wins over the stored tab on load', async () => {
    window.sessionStorage.setItem(KEY, 'build')
    window.history.replaceState(null, '', '/app/trip/demo?tab=for-you')
    mount()
    await flush()
    expect(selected()).toBe('For you')
    expect(window.sessionStorage.getItem(KEY)).toBe('for-you')
  })

  it('with no URL tab, the stored tab for THIS trip returns', async () => {
    window.sessionStorage.setItem(KEY, 'for-you')
    window.sessionStorage.setItem('astrail:trip-tab:some_other_trip', 'build')
    mount()
    await flush()
    expect(selected()).toBe('For you')
  })

  it('an unknown ?tab= is ignored', async () => {
    window.history.replaceState(null, '', '/app/trip/demo?tab=settings')
    mount()
    await flush()
    expect(selected()).toBe('Trip')
  })

  for (const from of ['For you', 'How it was built']) {
    it(`a map pin reveals its stop from the ${from} tab, with no remount of the map`, async () => {
      mount()
      await flush()
      await openTab(from)
      const map = screen.getByTestId('trip-map')
      const stop = placesForDay(TOKYO_TRIP, 2)[0]
      await act(async () => { mapProps.current!.onSelectPlace(stop.place_id) })
      await flush()
      expect(selected()).toBe('Trip')
      expect(card(stop.place_id)).toHaveAttribute('aria-current', 'true')
      expect(screen.getByTestId('trip-map')).toBe(map)
    })
  }

  it('the Trip tab keeps its scroll position across a trip to another tab', async () => {
    mount()
    await flush()
    const scroller = () => document.querySelector<HTMLElement>('[data-trip-scroll]')!
    scroller().scrollTop = 240
    await openTab('For you')
    expect(document.querySelector('[data-trip-scroll]')).toBeNull()
    await openTab('Trip')
    expect(scroller().scrollTop).toBe(240)
  })
})
