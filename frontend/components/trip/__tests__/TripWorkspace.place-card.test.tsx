import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'

/* A10 items 2, 4 and 6: the desktop place card's owner. TripWorkspace holds ONE open-card
   descriptor (kind, id, nonce), separate from selection; the sidebar lists compact rows that open
   the card; the detail moves to the sidebar when the map cannot show it. The mocked TripMap renders
   the card's React content inline, so the real dialog is in the document. */

type MapCardProp = { nonce: number; at: [number, number]; node: ReactNode } | null
type Cards = { onFallback: (n: number) => void; onDismiss: () => void; onOpenEat: (id: string) => void; onOpenHotel: (id: string) => void }
const { mapProps, toolProps, token } = vi.hoisted(() => ({
  mapProps: { current: null as null | { onSelectPlace: (id: string) => void; card?: MapCardProp; cards?: Cards; activeDayNumber: number; fitNonce?: number; selectedPlaceId: string | null } },
  toolProps: { current: null as null | Record<string, unknown> },
  token: { value: 'pk.test' as string | undefined },
}))

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', () => ({
  default: (props: NonNullable<typeof mapProps.current>) => {
    mapProps.current = props
    return <div data-testid="trip-map">{props.card?.node}</div>
  },
}))
vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(), Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}))
vi.mock('@/components/webmcp/TripTools', () => ({
  default: (props: Record<string, unknown>) => { toolProps.current = props; return null },
}))
vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))
vi.mock('@/lib/trip/insights/memory-events', async (orig) => ({
  ...(await orig<object>()),
  useTripMemoryWrites: () => ({ state: { kind: 'none' }, checkAgain: async () => {} }),
}))

import { showOnMapTool, type MapDeps } from '@/lib/webmcp/tools/map'
import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) }

function mount(bundle: TripBundle = TOKYO_TRIP) {
  return render(<MapProvider><TripWorkspace tripId={bundle.trip.id} bundle={bundle} readOnly /></MapProvider>)
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-trip-scroll] [data-place-id="${id}"]`)
const dialog = () => screen.queryByRole('dialog')
const sidebarDetail = () => document.querySelector('[data-trip-scroll] [data-stop-card] [data-evidence-chip]')
async function pin(id: string) { await act(async () => { mapProps.current!.onSelectPlace(id) }); await flush() }

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/app/trip/demo')
  window.sessionStorage.clear()
  token.value = 'pk.test'
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN })

describe('desktop: a pin opens its place card at the pin', () => {
  it('a pin click opens the stop\'s card on the map and marks its compact row current', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    expect(dialog()).toHaveAccessibleName('SANDO LAB TOKYO')
    expect(mapProps.current!.card!.at).toEqual([expect.any(Number), expect.any(Number)])
    const r = row('pl_sandolab')!
    expect(r).toHaveAttribute('aria-current', 'true')
    expect(r).toHaveAttribute('aria-haspopup', 'dialog')
    expect(r).not.toHaveAttribute('aria-expanded')
    expect(sidebarDetail()).toBeNull()                    // the detail is on the map, not doubled
  })

  it('a compact row opens the card; clicking it again is a new request (reopen after close)', async () => {
    mount()
    await flush()
    await act(async () => { row('pl_hpcafe')!.click() })
    const first = mapProps.current!.card!.nonce
    fireEvent.click(within(dialog()!).getByRole('button', { name: /close stop details/i }))
    expect(dialog()).toBeNull()
    await act(async () => { row('pl_hpcafe')!.click() })
    expect(mapProps.current!.card!.nonce).toBeGreaterThan(first)
  })

  it('next crosses into day 2 and the card stays open on the next stop (no day-change dismissal)', async () => {
    mount()
    await flush()
    await pin('pl_ichiran')
    fireEvent.click(within(dialog()!).getByRole('button', { name: /next stop/i }))
    await flush()
    expect(mapProps.current!.activeDayNumber).toBe(2)
    expect(dialog()).toHaveAccessibleName('Tokyo Disneyland')
  })

  it('choosing a day in the date strip closes the card', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    await act(async () => { screen.getByRole('button', { name: /^Day 2/ }).click() })
    expect(dialog()).toBeNull()
  })

  it('Escape closes it and focus returns to the logical opener: the pin, else its row', async () => {
    mount()
    await flush()
    const fakePin = document.createElement('button')
    fakePin.dataset.pinPlaceId = 'pl_sandolab'
    document.body.append(fakePin)
    await pin('pl_sandolab')
    fireEvent.keyDown(dialog()!, { key: 'Escape' })
    await flush()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(fakePin)
    fakePin.remove()                                    // the marker was replaced since
    await pin('pl_sandolab')
    fireEvent.keyDown(dialog()!, { key: 'Escape' })
    await flush()
    expect(document.activeElement).toBe(row('pl_sandolab'))
  })

  it('a click on the empty map closes it without moving focus', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    const before = document.activeElement
    await act(async () => { mapProps.current!.cards!.onDismiss() })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(before)
  })
})

describe('desktop: the detail moves to the sidebar when the map cannot show it', () => {
  it('when nothing fits at the pin (the map reports it), the row expands into the full detail', async () => {
    mount()
    await flush()
    await pin('pl_akasaka')
    await act(async () => { mapProps.current!.cards!.onFallback(mapProps.current!.card!.nonce) })
    expect(mapProps.current!.card).toBeNull()
    expect(sidebarDetail()).not.toBeNull()
    expect(row('pl_akasaka')).toHaveAttribute('aria-expanded', 'true')
  })

  it('"Details in the sidebar" is the user\'s choice, and "Show on the map" takes it back', async () => {
    mount()
    await flush()
    await pin('pl_akasaka')
    fireEvent.click(within(dialog()!).getByRole('button', { name: /details in the sidebar/i }))
    expect(mapProps.current!.card).toBeNull()
    expect(sidebarDetail()).not.toBeNull()
    await act(async () => { screen.getByRole('button', { name: /show on the map/i }).click() })
    expect(dialog()).toHaveAccessibleName('Akasaka Station')
  })

  it('an unlocated stop gets its detail in the sidebar (there is no pin to open at)', async () => {
    const b = structuredClone(TOKYO_TRIP)
    b.places[1].place.lat = 0
    b.places[1].place.lng = 0
    mount(b)
    await flush()
    await act(async () => { row('pl_hpcafe')!.click() })
    expect(mapProps.current!.card).toBeNull()
    expect(sidebarDetail()).not.toBeNull()
  })
})

describe('desktop: the card\'s links and the agent\'s show_on_map', () => {
  const deps = (): MapDeps => ({
    ...(toolProps.current as Omit<MapDeps, 'bundle' | 'view'>),
    bundle: () => TOKYO_TRIP,
    view: () => null,
  })

  it('show_on_map place opens the card; day and trip close it; trip moves no camera', async () => {
    mount()
    await flush()
    const tool = showOnMapTool(deps())
    await act(async () => { await tool.execute({ target: 'place', place: '3' }) })
    expect(dialog()).toHaveAccessibleName('SANDO LAB TOKYO')
    await act(async () => { await tool.execute({ target: 'day', day: 2 }) })
    expect(dialog()).toBeNull()
    await act(async () => { await tool.execute({ target: 'place', place: '3' }) })
    const fit = mapProps.current!.fitNonce
    await act(async () => { await tool.execute({ target: 'trip' }) })
    expect(dialog()).toBeNull()
    expect(mapProps.current!.fitNonce).toBe(fit)
  })

  it('Picked for you opens the Trip tab at the stop\'s day with its card', async () => {
    mount()
    await flush()
    await act(async () => { screen.getByRole('tab', { name: 'For you' }).click() })
    await act(async () => { screen.getAllByRole('button').find((b) => b.hasAttribute('data-picked-place'))!.click() })
    await flush()
    expect(screen.getByRole('tab', { name: 'Trip' })).toHaveAttribute('aria-selected', 'true')
    expect(dialog()).toHaveAccessibleName('Ichiran Shibuya')
  })

  it('"Day 2 overview" opens the Trip tab at that day with the overview open and focused', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    await act(async () => { screen.getByRole('tab', { name: 'How it was built' }).click() })
    await act(async () => { mapProps.current!.onSelectPlace('pl_disney') })
    await flush()
    fireEvent.click(within(dialog()!).getByRole('button', { name: /day 2 overview/i }))
    await flush()
    const overview = document.querySelector<HTMLDetailsElement>('[data-day-overview]')!
    expect(overview.open).toBe(true)
    expect(document.activeElement).toBe(overview.querySelector('summary'))
  })

  it('an eat pin and a sidebar eat open the eat card, in the same family', async () => {
    mount()
    await flush()
    await act(async () => { mapProps.current!.cards!.onOpenEat('pl_popo') })
    expect(dialog()).toHaveAccessibleName('Popo')
    expect(within(dialog()!).getByText(/Where to eat/)).toBeInTheDocument()
    fireEvent.click(within(dialog()!).getByRole('button', { name: /near sando lab tokyo/i }))
    await flush()
    expect(dialog()).toHaveAccessibleName('SANDO LAB TOKYO')
  })

  it('every place to eat on the day stays reachable in the sidebar', async () => {
    mount()
    await flush()
    const section = document.querySelector<HTMLElement>('[data-day-eats]')!
    const dayOne = TOKYO_TRIP.restaurants.filter((r) => r.trip_day_id === 'day_1')
    expect(section.querySelectorAll('[data-eat-card]')).toHaveLength(dayOne.length)
  })
})

/* A10 item 5: Tab B's insights wired in, and About redistributed on desktop (plan v2 §6): the
   summary and feedback stay at the end of the Trip tab, preferences and trade-offs go to For you,
   decisions to How it was built, missing details to a hero badge. Nothing is lost. */
describe('desktop: For you, How it was built and the About redistribution', () => {
  it('For you is Tab B\'s tab, mounted only while open', async () => {
    mount()
    await flush()
    expect(document.querySelector('[data-for-you-tab]')).toBeNull()
    await act(async () => { screen.getByRole('tab', { name: 'For you' }).click() })
    expect(document.querySelector('[data-for-you-tab]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Picked for you' })).toBeInTheDocument()
    expect(screen.getByText('Trade-offs to know about')).toBeInTheDocument()
    await act(async () => { screen.getByRole('tab', { name: 'Trip' }).click() })
    expect(document.querySelector('[data-for-you-tab]')).toBeNull()
  })

  it('How it was built is Tab B\'s timeline, with the full log', async () => {
    mount()
    await flush()
    await act(async () => { screen.getByRole('tab', { name: 'How it was built' }).click() })
    expect(document.querySelector('[data-build-timeline]')).not.toBeNull()
    expect(screen.getByText('Show full log')).toBeInTheDocument()
  })

  it('the hero badge comes from the corroborated preference helper', async () => {
    const { heroPreferenceBadge } = await import('@/components/trip/insights')
    mount()
    await flush()
    const expected = heroPreferenceBadge(TOKYO_TRIP)
    const badge = screen.queryByTestId('personal-badge')
    if (expected) expect(badge).toHaveTextContent(expected)
    else expect(badge).toBeNull()
  })

  it('the Trip tab ends with the trip summary and feedback, without the moved sections', async () => {
    const b = { ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status: 'complete' as const } }
    render(<MapProvider><TripWorkspace tripId={b.trip.id} bundle={b} /></MapProvider>)
    await flush()
    const scroll = document.querySelector<HTMLElement>('[data-trip-scroll]')!
    const about = within(scroll).getByRole('region', { name: 'About this trip' })
    expect(within(about).getByTestId('trip-feedback-panel')).toBeInTheDocument()
    expect(within(scroll).queryByText('Your preferences')).toBeNull()
    expect(within(scroll).queryByText('Trade-offs')).toBeNull()
    expect(within(scroll).queryByText('How Astrail built this')).toBeNull()
  })

  it('a trip saved with gaps shows a hero badge that opens the list of stops missing details', async () => {
    const b = structuredClone(TOKYO_TRIP)
    b.trip.status = 'saved_with_gaps'
    b.places[1].place.lat = 0
    b.places[1].place.lng = 0
    mount(b)
    await flush()
    const badge = screen.getByRole('button', { name: /missing details/i })
    expect(badge).toHaveAttribute('aria-expanded', 'false')
    await act(async () => { badge.click() })
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list', { name: /stops missing details/i })).toHaveTextContent(b.places[1].place.name)
  })
})

/* A10 runtime finding: with compact rows the list is often too short for a row's
   scrollIntoView({block:'start'}) to be satisfied inside [data-trip-scroll], and the browser then
   scrolled the next ancestor, the overflow-hidden floating panel: its hero slid out of sight and an
   empty band showed at the bottom. The panel only clips; it never keeps a scroll offset. */
describe('the floating panel never keeps a scroll offset', () => {
  it('snaps itself back when a descendant\'s scrollIntoView scrolls it', async () => {
    mount()
    await flush()
    const aside = document.getElementById('trip-details-panel')!
    aside.scrollTop = 180
    fireEvent.scroll(aside)
    expect(aside.scrollTop).toBe(0)
  })
})

describe('the way back to the map card', () => {
  it('is not offered after an automatic fallback (it would only fall back again)', async () => {
    mount()
    await flush()
    await pin('pl_akasaka')
    await act(async () => { mapProps.current!.cards!.onFallback(mapProps.current!.card!.nonce) })
    expect(screen.queryByRole('button', { name: /show on the map/i })).toBeNull()
  })
})

/* Codex final review (A11): #2, #3, #7, #8 on the owner side. */
describe('Codex final: where the detail goes when the map cannot show it', () => {
  const cardsOf = () => mapProps.current!.cards! as Cards & { onAvailability?: (a: boolean) => void }
  const HOTELS = async () => (await import('@/lib/trip/fixtures/tokyo-hotels')).TOKYO_TRIP_WITH_HOTELS

  // #2: a token, but the map never loaded: the row's detail stays in the sidebar, and the card
  // appears once (if ever) the map can present it.
  it('keeps the stop detail in the sidebar while the map is unavailable, then moves it to the card', async () => {
    mount()
    await flush()
    await act(async () => { cardsOf().onAvailability!(false) })
    await act(async () => { row('pl_sandolab')!.click() })
    expect(mapProps.current!.card).toBeNull()
    expect(sidebarDetail()).not.toBeNull()
    await act(async () => { cardsOf().onAvailability!(true) })
    expect(dialog()).toHaveAccessibleName('SANDO LAB TOKYO')
  })

  // #3: an eat card that cannot be placed (768 with the panel open) shows its WHOLE detail in the
  // sidebar (hours, website), revealed on the Trip tab, focused, even from another tab.
  it('an eat card that falls back shows its full detail in the sidebar, focused, from another tab', async () => {
    const b = structuredClone(TOKYO_TRIP)
    const r = b.restaurants.find((x) => x.restaurant_place_id === 'pl_popo')!
    r.evidence_json = { ...r.evidence_json, details: { opening_hours: 'Daily 10:00-18:00', website: 'https://popo.example/' } }
    mount(b)
    await flush()
    await act(async () => { screen.getByRole('tab', { name: 'For you' }).click() })
    await act(async () => { cardsOf().onOpenEat('pl_popo') })
    await act(async () => { cardsOf().onFallback(mapProps.current!.card!.nonce) })
    await flush()
    expect(dialog()).toBeNull()
    expect(screen.getByRole('tab', { name: 'Trip' })).toHaveAttribute('aria-selected', 'true')
    const detail = screen.getByRole('region', { name: 'Popo' })
    expect(within(detail).getByText('Daily 10:00-18:00')).toBeInTheDocument()
    expect(within(detail).getByRole('link', { name: /more about this place/i })).toHaveAttribute('href', 'https://popo.example/')
    expect(detail.contains(document.activeElement)).toBe(true)
  })

  it('a hotel card that falls back shows its full detail in the Stay view, with the panel reopened', async () => {
    const b = await HOTELS()
    mount(b)
    await flush()
    await act(async () => { screen.getByRole('button', { name: 'Hide trip details and show the full map' }).click() })
    await act(async () => { cardsOf().onOpenHotel('hotel_1') })
    await act(async () => { cardsOf().onFallback(mapProps.current!.card!.nonce) })
    await flush()
    const panel = document.getElementById('trip-details-panel')!
    expect(panel).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveAttribute('aria-current', 'true')
    const detail = screen.getByRole('region', { name: b.hotels[0].name })
    expect(within(detail).getByText(/guest score/)).toBeInTheDocument()
    expect(within(detail).getByText(/Search result from Travala/)).toBeInTheDocument()
  })

  // #7: "Details in the sidebar" from another tab or a collapsed panel reveals where it went.
  it('"Details in the sidebar" from For you switches to the Trip tab and focuses the detail', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    await act(async () => { screen.getByRole('tab', { name: 'For you' }).click() })
    fireEvent.click(within(dialog()!).getByRole('button', { name: /details in the sidebar/i }))
    await flush()
    expect(screen.getByRole('tab', { name: 'Trip' })).toHaveAttribute('aria-selected', 'true')
    expect(sidebarDetail()).not.toBeNull()
    expect(document.activeElement).toBe(row('pl_sandolab'))
  })

  it('"Details in the sidebar" with the panel collapsed reopens it first', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    await act(async () => { screen.getByRole('button', { name: 'Hide trip details and show the full map' }).click() })
    fireEvent.click(within(dialog()!).getByRole('button', { name: /details in the sidebar/i }))
    await flush()
    expect(document.getElementById('trip-details-panel')).not.toHaveAttribute('inert')
    expect(document.activeElement).toBe(row('pl_sandolab'))
  })

  it('an automatic fallback does not pull focus off the map canvas (keyboard panning)', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    const canvas = document.createElement('div')
    canvas.className = 'mapboxgl-canvas-container'
    canvas.tabIndex = 0
    document.body.append(canvas)
    canvas.focus()
    await act(async () => { cardsOf().onFallback(mapProps.current!.card!.nonce) })
    await flush()
    expect(sidebarDetail()).not.toBeNull()
    expect(document.activeElement).toBe(canvas)
    canvas.remove()
  })

  // #8: revealing the stop that is already selected (show_on_map after a pan) asks for the flight
  // again; the trip target stays camera-free.
  it('a repeated reveal of the selected stop requests the selection flight again', async () => {
    mount()
    await flush()
    await pin('pl_sandolab')
    const before = (mapProps.current as unknown as { focusNonce: number }).focusNonce
    await pin('pl_sandolab')
    expect((mapProps.current as unknown as { focusNonce: number }).focusNonce).toBe(before + 1)
  })
})
