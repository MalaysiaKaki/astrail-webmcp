import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'

/* The desktop/mobile branch in TripWorkspace (plan Phase 2, amendments 2, 4, 5, 7).
   TripMap is stubbed so a test can drive a real pin tap and count mounts: the map driver and the
   agent tools must stay mounted OUTSIDE the branch, so crossing the md line swaps the panel tree
   and nothing else. */

const h = vi.hoisted(() => ({
  mapMounts: 0,
  mapProps: null as null | { onSelectPlace: (id: string) => void; layerMode?: string; focusNonce?: number; fitNonce?: number },
  mobile: false,
  listeners: new Set<() => void>(),
  registered: [] as string[],
  tools: {} as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> | unknown }>,
  aborted: [] as string[],
}))

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', async () => {
  const { useEffect } = await import('react')
  return {
    default: (props: { onSelectPlace: (id: string) => void }) => {
      h.mapProps = props
      useEffect(() => { h.mapMounts++ }, [])
      return <div data-testid="trip-map" />
    },
  }
})
vi.mock('mapbox-gl', () => {
  const handler = () => ({ enable: () => {}, disable: () => {} })
  const map = {
    on: () => {}, off: () => {}, setConfigProperty: () => {}, remove: () => {}, resize: () => {}, stop: () => {},
    style: { setTransition: () => {} },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  return { default: { Map: vi.fn(() => map), Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }
})
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app/trip/demo' }))
vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

function setMobile(next: boolean) {
  h.mobile = next
  act(() => { h.listeners.forEach((l) => l()) })
}

function renderSeeded(bundle: TripBundle = TOKYO_TRIP, strict = false, readOnly = true) {
  const ui = (
    <MapProvider>
      <TripWorkspace tripId={bundle.trip.id} bundle={bundle} readOnly={readOnly} />
    </MapProvider>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

const sheet = () => screen.queryByTestId('mobile-trip-sheet')
const desktopRail = () => document.getElementById('trip-details-panel')

beforeEach(() => {
  h.mapMounts = 0
  h.mapProps = null
  h.mobile = true
  h.listeners.clear()
  h.registered.length = 0
  h.aborted.length = 0
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return h.mobile },
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.listeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { h.listeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: (tool: { name: string; execute: (a: Record<string, unknown>) => unknown }, opts?: { signal?: AbortSignal }) => {
        h.registered.push(tool.name)
        h.tools[tool.name] = tool
        opts?.signal?.addEventListener('abort', () => h.aborted.push(tool.name))
      },
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'modelContext')
  delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
})

describe('TripWorkspace — the phone branch', () => {
  it('renders the phone view, and never the desktop rail, below md', async () => {
    renderSeeded()
    expect(sheet()).toBeInTheDocument()
    expect(desktopRail()).toBeNull()
    expect(await screen.findByTestId('trip-map')).toBeInTheDocument()
  })

  it('renders the desktop rail, and never the phone view, at md and up', () => {
    h.mobile = false
    renderSeeded()
    expect(desktopRail()).toBeInTheDocument()
    expect(sheet()).toBeNull()
  })

  it('shows the day chips and at least two stops with evidence on first paint', () => {
    renderSeeded()
    expect(screen.getByRole('button', { name: /Day 1/ })).toBeInTheDocument()
    const rows = document.querySelectorAll('[data-testid="mobile-trip-sheet"] [data-place-id]')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(within(rows[0] as HTMLElement).getByText(/HARRY POTTER/)).toBeInTheDocument()
  })

  it('swaps only the panel tree across 767↔768 — the map driver and the tools stay mounted', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const mounts = h.mapMounts
    const registeredBefore = h.registered.length
    setMobile(false)
    expect(desktopRail()).toBeInTheDocument()
    expect(sheet()).toBeNull()
    setMobile(true)
    expect(sheet()).toBeInTheDocument()
    expect(h.mapMounts).toBe(mounts)
    expect(h.registered.length).toBe(registeredBefore)   // no registration churn
    expect(h.aborted).toEqual([])
  })

  it('keeps tool registration stable across sheet toggles', () => {
    renderSeeded()
    const before = h.registered.length
    expect(before).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /expand trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /collapse trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /show trip sheet/i }))
    expect(h.registered.length).toBe(before)
    expect(h.aborted).toEqual([])
  })

  it('keeps the sheet compact when a pin is tapped on a phone, and opens it if hidden', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    fireEvent.click(screen.getByRole('button', { name: /hide trip sheet/i }))
    expect(sheet()).toHaveAttribute('inert')
    const lastDay = TOKYO_TRIP.days[TOKYO_TRIP.days.length - 1].day_number
    const other = placesForDay(TOKYO_TRIP, lastDay)[0]
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    await act(async () => { h.mapProps!.onSelectPlace(other.place_id) })
    // The pin's own stop is brought into view in the phone scroller, not just rendered somewhere.
    expect((scrolled.mock.contexts.at(-1) as Element).querySelector(`[data-place-id="${other.place_id}"]`)).not.toBeNull()
    expect(sheet()).not.toHaveAttribute('inert')
    expect(sheet()!.className).toContain('h-[45dvh]')
    expect(document.querySelector(`[data-place-id="${other.place_id}"]`)).toHaveAttribute('aria-expanded', 'true')
  })

  it('re-frames the map when the selected row is tapped again', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const first = placesForDay(TOKYO_TRIP, 1)[0]
    const row = () => document.querySelector<HTMLElement>(`[data-place-id="${first.place_id}"]`)!
    fireEvent.click(row())
    const nonce = h.mapProps!.focusNonce ?? 0
    fireEvent.click(row())
    expect(h.mapProps!.focusNonce).toBe(nonce + 1)
  })

  it('offers no Stay chip or layer toggle when the trip has no hotels', () => {
    renderSeeded()
    expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Map layer' })).toBeNull()
  })

  it('Stay swaps the list to hotels (unresolved ones included) and a day chip returns to the route', async () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    await screen.findByTestId('trip-map')
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(h.mapProps!.layerMode).toBe('hub')
    for (const hotel of TOKYO_TRIP_WITH_HOTELS.hotels) {
      expect(screen.getAllByText(hotel.name).length).toBeGreaterThan(0)
    }
    expect(document.querySelector('[data-testid="mobile-trip-sheet"] [data-place-id]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Day 1/ }))
    expect(h.mapProps!.layerMode).toBe('route')
    expect(document.querySelector('[data-testid="mobile-trip-sheet"] [data-place-id]')).not.toBeNull()
  })

  it('renders under Strict Mode without a second map driver', async () => {
    renderSeeded(TOKYO_TRIP, true)
    await screen.findByTestId('trip-map')
    expect(screen.getAllByTestId('trip-map')).toHaveLength(1)
    expect(sheet()).toBeInTheDocument()
  })

  /* Phase 5 — real-trip states on a phone. */
  const withStatus = (status: TripBundle['trip']['status']): TripBundle =>
    ({ ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status } })
  const about = () => screen.getByText('About this trip').closest('details')!

  it.each(['complete', 'saved_with_gaps'] as const)(
    'offers the feedback composer inside About this trip for a %s real trip', (status) => {
      renderSeeded(withStatus(status), false, false)
      expect(within(about()).getByTestId('trip-feedback-panel')).toBeInTheDocument()
    })

  it('keeps the feedback allowlist: none on a read-only sample, none on places_ready', () => {
    const { unmount } = renderSeeded(withStatus('complete'), false, true)
    expect(screen.queryByTestId('trip-feedback-panel')).toBeNull()
    unmount()
    renderSeeded(withStatus('places_ready'), false, false)
    expect(screen.queryByTestId('trip-feedback-panel')).toBeNull()
  })

  it('renders the shared failed screen (with feedback) rather than a sheet', () => {
    renderSeeded(withStatus('failed'), false, false)
    expect(screen.getByText('Generation failed')).toBeInTheDocument()
    expect(screen.getByTestId('trip-feedback-panel')).toBeInTheDocument()
    expect(sheet()).toBeNull()
  })

  it.each(['generating', 'draft'] as const)('renders the shared still-generating screen for %s', (status) => {
    renderSeeded(withStatus(status))
    expect(screen.getByText(/Still generating/)).toBeInTheDocument()
    expect(sheet()).toBeNull()
  })

  it('offers a chip for every day of a long trip, and switches the list to it', () => {
    const days = Array.from({ length: 6 }, (_, i) => ({ ...TOKYO_TRIP.days[0], id: `d${i + 1}`, day_number: i + 1 }))
    const places = days.map((d, i) => ({
      ...TOKYO_TRIP.places[0], id: `tp${i}`, place_id: `p${i}`, day_number: d.day_number, sort_order: 0,
      place: { ...TOKYO_TRIP.places[0].place, id: `p${i}`, name: `Stop on day ${d.day_number}` },
    }))
    renderSeeded({ ...TOKYO_TRIP, days, places, transport_legs: [], restaurants: [] })
    for (const d of days) expect(screen.getByRole('button', { name: new RegExp(`^Day ${d.day_number}\\b`) })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Day 6\b/ }))
    expect(within(sheet()!).getByText('Stop on day 6')).toBeInTheDocument()
  })

  /* Phase 7: phones suppress the map's evidence POPUP, not what the agent tools do. The real
     registered callbacks are executed here under the phone layout. */
  it('keeps show_on_map working on a phone: data back, stop selected and expanded', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const text = (r: unknown) => JSON.stringify(r)

    const shown = await act(async () => h.tools.show_on_map.execute({ target: 'place', place: '2' }))
    expect(text(shown)).toMatch(/Harry Potter Cafe/)
    expect(document.querySelector('[data-place-id="pl_hpcafe"]')).toHaveAttribute('aria-expanded', 'true')
    // get_place_evidence is a GlobalTools read; its phone check lives in public-sample-tools.test.
  })

  it('keeps the gaps status out of the sheet header and says it in traveller words in About', () => {
    renderSeeded()   // TOKYO_TRIP is saved_with_gaps
    const header = screen.getByRole('group', { name: 'Trip days' }).parentElement!
    expect(within(header).queryByText(/Saved with gaps/)).toBeNull()
    expect(within(about()).getByText('Some stops are missing details')).toBeInTheDocument()
    expect(within(about()).queryByText('Saved with gaps')).toBeNull()
  })

  it('scrolls About this trip into view when it is opened', () => {
    renderSeeded()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const details = about()
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(spy.mock.contexts.at(-1)).toBe(details)
  })

  /* ---- Phase A1 (Placify revamp): map chrome, sheet header, date strip, day sub-header ---- */

  const stack = () => document.querySelector<HTMLElement>('[data-testid="map-control-stack"]')!
  const fit = () => screen.queryByRole('button', { name: /^Fit map to/ })
  const heading = () => document.querySelector<HTMLElement>('[data-testid="sheet-heading"]')!

  it('puts only circular kit controls over the map: back top-left, a stack top-right, no title pill', () => {
    renderSeeded()
    const back = screen.getByRole('link', { name: 'All trails' })
    expect(back.className).toMatch(/\bm-btn-icon\b/)
    expect(stack()).toBeInTheDocument()
    for (const b of within(stack()).getAllByRole('button')) expect(b.className).toMatch(/\bm-btn-icon\b/)
    // The title lives in the sheet as its heading, not in a pill over the map.
    const title = within(heading()).getByRole('heading', { level: 2, name: TOKYO_TRIP.trip.inferred_destination! })
    expect(sheet()!.contains(title)).toBe(true)
    for (const el of screen.getAllByText(TOKYO_TRIP.trip.inferred_destination!)) expect(sheet()!.contains(el)).toBe(true)
  })

  /* A1 follow-up: the demo has no hotels, and here no dock fills the agent slot — so the stack is
     Fit and nothing else. Each control draws its own glyph, so no two can be mistaken. */
  it('shows only Fit in the demo stack: no hotels means no layer toggle', () => {
    renderSeeded()
    const buttons = within(stack()).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Fit map to the day'])
    expect(screen.queryByRole('button', { name: 'Hotel map layer' })).toBeNull()
    expect(buttons[0].querySelector('svg')).toHaveAttribute('data-icon', 'scope')
  })

  it('draws the hotel layer toggle with its own bed glyph, distinct from Fit', () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    const icons = within(stack()).getAllByRole('button').map((b) => b.querySelector('svg')!.getAttribute('data-icon'))
    expect(icons).toEqual(['scope', 'bed'])
  })

  it('offers the agent a slot at the top of the stack (the dock fills it when WebMCP exists)', () => {
    renderSeeded()
    expect(stack().firstElementChild).toHaveAttribute('data-agent-trigger-slot')
  })

  it('Fit re-frames the active day on every press, and names what it will frame', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    expect(fit()).toHaveAccessibleName('Fit map to the day')
    const before = h.mapProps!.fitNonce ?? 0
    fireEvent.click(fit()!)
    fireEvent.click(fit()!)                                      // again, after the user panned
    expect(h.mapProps!.fitNonce).toBe(before + 2)
  })

  it('says Fit frames the whole trip when the active day has no located stop', () => {
    const places = TOKYO_TRIP.places.map((tp) => (tp.day_number === 2 ? { ...tp, place: { ...tp.place, lat: 0, lng: 0 } } : tp))
    renderSeeded({ ...TOKYO_TRIP, places })
    fireEvent.click(screen.getByRole('button', { name: /^Day 2\b/ }))
    expect(fit()).toHaveAccessibleName('Fit map to the whole trip')
  })

  it('hides Fit when nothing on the trip has a location', () => {
    renderSeeded({ ...TOKYO_TRIP, places: TOKYO_TRIP.places.map((tp) => ({ ...tp, place: { ...tp.place, lat: 0, lng: 0 } })) })
    expect(fit()).toBeNull()
  })

  it("keeps show_on_map({target:'trip'}) camera-free: it never presses Fit", async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const before = h.mapProps!.fitNonce ?? 0
    await act(async () => { await h.tools.show_on_map.execute({ target: 'trip' }) })
    expect(h.mapProps!.fitNonce ?? 0).toBe(before)
  })

  it('has one hotel-layer toggle in the stack when hotels exist, pressed in the hub layer', async () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    await screen.findByTestId('trip-map')
    const layer = within(stack()).getByRole('button', { name: 'Hotel map layer' })
    expect(layer).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(layer)
    expect(h.mapProps!.layerMode).toBe('hub')
    expect(layer).toHaveAttribute('aria-pressed', 'true')
    expect(fit()).toHaveAccessibleName('Fit map to the hotel')
    fireEvent.click(layer)
    expect(h.mapProps!.layerMode).toBe('route')
  })

  it('keeps only the agent slot in the stack while the sheet is expanded over the map', () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    fireEvent.click(screen.getByRole('button', { name: /expand trip sheet/i }))
    expect(within(stack()).queryAllByRole('button')).toHaveLength(0)
    expect(stack().querySelector('[data-agent-trigger-slot]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /collapse trip sheet/i }))
    expect(fit()).not.toBeNull()
  })

  it('shows the header: serif title, date range and the Sample tag', () => {
    renderSeeded()
    expect(within(heading()).getByRole('heading', { level: 2 }).className).toMatch(/\btype-display\b/)
    expect(within(heading()).getByText(/Sep 18/)).toBeInTheDocument()
    expect(within(heading()).getByText('Sample')).toBeInTheDocument()
  })

  it('names each strip day by its date, marks the current one, and puts Stay last', () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    const strip = screen.getByRole('group', { name: 'Trip days' })
    const buttons = within(strip).getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Day 1, Fri 18 Sep')
    expect(buttons[0]).toHaveAttribute('aria-current', 'true')
    expect(buttons[1]).not.toHaveAttribute('aria-current')
    expect(buttons.at(-1)).toHaveAccessibleName('Stay')
    fireEvent.click(buttons.at(-1)!)
    expect(buttons.at(-1)).toHaveAttribute('aria-current', 'true')
    expect(buttons[0]).not.toHaveAttribute('aria-current')
  })

  it('opens a day from the strip at the top of its list, not at the last scroll position', () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    const body = document.getElementById('mobile-trip-sheet-body')!
    body.scrollTop = 480
    fireEvent.click(screen.getByRole('button', { name: /^Day 2\b/ }))
    expect(body.scrollTop).toBe(0)
    body.scrollTop = 300
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(body.scrollTop).toBe(0)
  })

  it('falls back to "Day N" for a day with no date', () => {
    const days = TOKYO_TRIP.days.map((d) => ({ ...d, day_date: null }))
    renderSeeded({ ...TOKYO_TRIP, days })
    const strip = screen.getByRole('group', { name: 'Trip days' })
    expect(within(strip).getAllByRole('button')[0]).toHaveAccessibleName('Day 1')
    expect(screen.getByRole('heading', { level: 3, name: /^Day 1/ })).toBeInTheDocument()
  })

  it('opens the day with a sub-header: the date, a "Day N" capsule and the day title', () => {
    renderSeeded()
    const sub = screen.getByRole('heading', { level: 3, name: 'Sep 18' })
    const row = sub.parentElement!
    expect(within(row).getByText('Day 1')).toBeInTheDocument()
    expect(within(row).getByText(TOKYO_TRIP.days[0].title!)).toBeInTheDocument()
  })

  it('makes the day overview a card link that opens inline', () => {
    renderSeeded()
    const summary = document.querySelector<HTMLElement>('[data-testid="mobile-trip-sheet"] details summary.m-card-link')
    expect(summary).not.toBeNull()
    expect(summary!.querySelector('.m-chevron')).not.toBeNull()
  })

  /* A3 browser finding: an external selection's scrollIntoView({block:'start'}) aligned the card
     to the top of EVERY scrollable ancestor, and <main> (overflow:hidden is still scrollable by
     script) scrolled 466px, sliding the sheet over the top of the screen. overflow:clip clips the
     same but is not a scroll container. jsdom has no layout, so this pins the property. */
  it('keeps the route <main> out of the scroll chain: overflow clip, not hidden', () => {
    renderSeeded()
    const main = sheet()!.closest('main')!
    expect(main.className).toMatch(/\boverflow-clip\b/)
    expect(main.className).not.toMatch(/\boverflow-hidden\b/)
  })

  it('has exactly one hide control in the sheet, top-right, not a second chevron beside the handle', () => {
    renderSeeded()
    const hide = screen.getByRole('button', { name: /hide trip sheet/i })
    expect(hide.className).toMatch(/\bright-/)
    expect(hide.className).toMatch(/\bh-11\b/)
    expect(hide.className).toMatch(/\bw-11\b/)
  })
})
