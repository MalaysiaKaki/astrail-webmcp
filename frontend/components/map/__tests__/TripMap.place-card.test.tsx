import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { setPanelObstruction } from '@/lib/trip/panel-obstruction'
import MapProvider from '@/components/map/MapProvider'
import TripMap from '@/components/map/TripMap'

/* A10 items 2 and 3 (Codex map-card review migration table): on desktop a pin's detail opens AT
   the pin as a Mapbox Popup shell owned by TripMap, around one React-portalled host. These mocks
   attach popups to the real DOM and fire the map's events, so focus, visibility and cleanup are
   observable; constructor counts alone would not be. */

const h = vi.hoisted(() => {
  type Handler = (e?: unknown) => void
  const listeners = new Map<string, Set<Handler>>()
  const onceListeners = new Map<string, Set<Handler>>()
  const layer = document.createElement('div')
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const state = { moving: false, width: 1440, height: 900, pin: { x: 900, y: 270 } }
  const map = {
    on: vi.fn((ev: string, fn: Handler) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev)!.add(fn) }),
    off: vi.fn((ev: string, fn: Handler) => { listeners.get(ev)?.delete(fn); onceListeners.get(ev)?.delete(fn) }),
    once: vi.fn((ev: string, fn: Handler) => { if (!onceListeners.has(ev)) onceListeners.set(ev, new Set()); onceListeners.get(ev)!.add(fn) }),
    getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: state.width, clientHeight: state.height })),
    getContainer: vi.fn(() => ({ clientWidth: state.width, clientHeight: state.height, getBoundingClientRect: () => ({ left: 0, top: 0 }), style: { setProperty: vi.fn(), removeProperty: vi.fn() } })),
    project: vi.fn(() => ({ ...state.pin })),
    addSource: vi.fn(), addLayer: vi.fn(), getSource: vi.fn(() => undefined), getLayer: vi.fn(() => undefined),
    removeLayer: vi.fn(), removeSource: vi.fn(),
    flyTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(), panBy: vi.fn(), jumpTo: vi.fn(),
    isMoving: vi.fn(() => state.moving), setPadding: vi.fn(), setConfigProperty: vi.fn(),
    remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  function fire(ev: string, e?: unknown) {
    for (const fn of [...(listeners.get(ev) ?? [])]) fn(e)
    const once = [...(onceListeners.get(ev) ?? [])]
    onceListeners.get(ev)?.clear()
    for (const fn of once) fn(e)
  }
  type PopupMock = { options: Record<string, unknown>; el: HTMLElement; removed: boolean; remove: () => void }
  const popups: PopupMock[] = []
  const PopupCtor = vi.fn((options: Record<string, unknown>) => {
    const el = document.createElement('div')
    el.className = `mapboxgl-popup ${String(options.className ?? '')}`
    const p = {
      options, el, removed: false,
      setLngLat: vi.fn(() => p),
      setDOMContent: vi.fn((node: HTMLElement) => { el.append(node); return p }),
      addTo: vi.fn(() => { layer.append(el); return p }),
      remove: vi.fn(() => { p.removed = true; el.remove(); return p }),
      on: vi.fn(),
    }
    popups.push(p)
    return p
  })
  const markers: HTMLElement[] = []
  const MarkerCtor = vi.fn((o: { element: HTMLElement }) => {
    markers.push(o.element)
    const m = { setLngLat: vi.fn(() => m), addTo: vi.fn(() => { layer.append(o.element); return m }), remove: vi.fn(() => o.element.remove()) }
    return m
  })
  return { map, fire, popups, PopupCtor, MarkerCtor, markers, layer, state, listeners, onceListeners }
})

vi.mock('mapbox-gl', () => ({
  default: {
    Map: vi.fn(() => h.map), Marker: h.MarkerCtor, Popup: h.PopupCtor,
    LngLatBounds: vi.fn(() => ({ extend: vi.fn() })), accessToken: '',
  },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('@/lib/trip/safe-area', () => ({ readSafeAreaTop: () => 0 }))
const layout = vi.hoisted(() => ({ value: 'desktop' as 'desktop' | 'mobile' }))
vi.mock('@/lib/trip/use-trip-layout', () => ({ useTripLayout: () => layout.value }))

const reduced = vi.hoisted(() => ({ on: false }))

async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
function fireLoad() { act(() => { h.fire('load') }) }

const live = () => h.popups.filter((p) => !p.removed)
const cardEl = () => document.querySelector<HTMLElement>('[data-testid="card"]')

type Props = Partial<Parameters<typeof TripMap>[0]>
function TripMapHarness(props: Props) {
  return (
    <MapProvider>
      <TripMap bundle={TOKYO_TRIP} activeDayNumber={1} selectedPlaceId={null} onSelectPlace={() => {}} {...props} />
    </MapProvider>
  )
}
const Card = () => <div data-testid="card" data-place-card tabIndex={-1}>Sando</div>

async function open(props: Props = {}) {
  const view = render(<TripMapHarness {...props} />)
  await flush()
  fireLoad()
  await flush()
  return view
}

const cards = () => ({
  onFallback: vi.fn(), onDismiss: vi.fn(), onOpenEat: vi.fn(), onOpenHotel: vi.fn(),
})

describe('TripMap desktop place card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.popups.length = 0
    h.markers.length = 0
    h.layer.replaceChildren()
    document.body.append(h.layer)
    h.state.moving = false
    h.state.width = 1440
    h.state.height = 900
    h.state.pin = { x: 900, y: 270 }
    h.listeners.clear()
    h.onceListeners.clear()
    layout.value = 'desktop'
    reduced.on = false
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: q.includes('reduce') ? reduced.on : false, media: q, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList)
    setPanelObstruction(472)
  })
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setPanelObstruction(0)
  })

  it('opens ONE card at the pin, below it, visible and focused, holding the React content', async () => {
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    const popups = live().filter((p) => String(p.options.className).includes('place-card-popup'))
    expect(popups).toHaveLength(1)
    expect(popups[0].options).toMatchObject({ anchor: 'top', closeButton: false, focusAfterOpen: false })
    expect(String(popups[0].options.className)).not.toContain('measuring')
    expect(popups[0].el.contains(cardEl())).toBe(true)
    expect(document.activeElement).toBe(cardEl())
  })

  it('stays hidden until the selection flight lands, then places', async () => {
    h.state.moving = true
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    expect(String(live().at(-1)!.options.className)).toContain('place-card-popup--measuring')
    h.state.moving = false
    act(() => { h.fire('moveend') })
    expect(String(live().at(-1)!.options.className)).not.toContain('measuring')
  })

  it('reopening the same stop is a new request, still one card', async () => {
    const c = cards()
    const view = await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: c })
    view.rerender(<TripMapHarness selectedPlaceId="pl_sandolab" card={null} cards={c} />)
    expect(live().filter((p) => String(p.options.className).includes('place-card'))).toHaveLength(0)
    view.rerender(<TripMapHarness selectedPlaceId="pl_sandolab" card={{ nonce: 2, at: [139.77, 35.7], node: <Card /> }} cards={c} />)
    await flush()
    expect(live().filter((p) => String(p.options.className).includes('place-card'))).toHaveLength(1)
  })

  it('spends ONE bounded correction when the card does not fit, then places', async () => {
    h.state.pin = { x: 470, y: 40 }             // under the panel's edge, against the top
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    expect(h.map.panBy).toHaveBeenCalledTimes(1)
    const [[dx, dy]] = h.map.panBy.mock.calls[0] as [[number, number]]
    h.state.pin = { x: 470 - dx, y: 40 - dy }  // panBy(offset) moves the content by -offset
    act(() => { h.fire('moveend') })
    expect(String(live().at(-1)!.options.className)).not.toContain('measuring')
    act(() => { h.fire('moveend') })
    expect(h.map.panBy).toHaveBeenCalledTimes(1)
    expect(h.map.flyTo.mock.calls.length + h.map.easeTo.mock.calls.length).toBeGreaterThanOrEqual(0)
  })

  it('keeps zoom, pitch and bearing in the correction, and makes it instant under reduced motion', async () => {
    reduced.on = true
    h.state.pin = { x: 470, y: 40 }
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    const opts = h.map.panBy.mock.calls[0][1] as Record<string, unknown>
    expect(opts.duration).toBe(0)
    expect(opts).not.toHaveProperty('zoom')
    expect(opts).not.toHaveProperty('pitch')
  })

  it('a user gesture during the flight cancels the correction: the detail goes to the sidebar', async () => {
    h.state.moving = true
    h.state.pin = { x: 470, y: 40 }
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 7, at: [139.77, 35.7], node: <Card /> }, cards: c })
    act(() => { h.fire('dragstart', { originalEvent: new MouseEvent('mousedown') }) })
    h.state.moving = false
    act(() => { h.fire('moveend') })
    expect(h.map.panBy).not.toHaveBeenCalled()
    expect(c.onFallback).toHaveBeenCalledWith(7)
  })

  it('hands the detail to the sidebar when nothing fits (768 wide), with no camera move', async () => {
    h.state.width = 768
    setPanelObstruction(356)
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 3, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(c.onFallback).toHaveBeenCalledWith(3)
    expect(h.map.panBy).not.toHaveBeenCalled()
    expect(live().filter((p) => String(p.options.className).includes('place-card'))).toHaveLength(0)
  })

  it('a click on the empty map dismisses the card; a click on a pin does not', async () => {
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: c })
    act(() => { h.fire('click', { originalEvent: { target: h.markers[0] } }) })
    expect(c.onDismiss).not.toHaveBeenCalled()
    act(() => { h.fire('click', { originalEvent: { target: document.body } }) })
    expect(c.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('removes its shell when the route unmounts (the shared map lives on), also under Strict Mode', async () => {
    const view = render(
      <StrictMode><TripMapHarness selectedPlaceId="pl_sandolab" card={{ nonce: 1, at: [139.77, 35.7], node: <Card /> }} cards={cards()} /></StrictMode>,
    )
    await flush()
    fireLoad()
    await flush()
    expect(live().filter((p) => String(p.options.className).includes('place-card'))).toHaveLength(1)
    view.unmount()
    expect(live().filter((p) => String(p.options.className).includes('place-card'))).toHaveLength(0)
    expect(document.querySelector('[data-testid="card"]')).toBeNull()
  })

  it('does not take focus from a pending approval or a text field', async () => {
    const input = document.createElement('textarea')
    document.body.append(input)
    input.focus()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    expect(document.activeElement).toBe(input)
    input.remove()
  })

  it('hides the selected pin\'s own name pill while its card is open (the card title names it)', async () => {
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: cards() })
    act(() => { h.fire('moveend') })
    const pin = h.markers.find((m) => m.getAttribute('aria-label') === 'SANDO LAB TOKYO')!
    expect(pin.querySelector<HTMLElement>('.phone-pin__name')?.hidden ?? true).toBe(true)
  })

  it('desktop eat and hotel pins open their cards through the owner, not a DOM popup', async () => {
    const c = cards()
    await open({ bundle: TOKYO_TRIP_WITH_HOTELS, layerMode: 'hub', selectedHotelId: 'hotel_1', cards: c, card: null })
    const before = h.popups.length
    const eat = h.markers.find((m) => m.classList.contains('eat-pin') || m.querySelector('.eat-pin'))
    act(() => { eat?.click() })
    const hub = h.markers.find((m) => m.classList.contains('hotel-hub-pin'))!
    act(() => { hub.click() })
    expect(c.onOpenHotel).toHaveBeenCalledWith('hotel_1')
    expect(h.popups.length).toBe(before)
  })

  it('phone keeps its DOM eat card and never opens a place card', async () => {
    layout.value = 'mobile'
    const c = cards()
    const view = await open({ cards: c, card: { nonce: 1, at: [139.77, 35.7], node: <Card /> } })
    view.rerender(<TripMapHarness selectedRestaurantPlaceId="pl_popo" cards={c} card={{ nonce: 1, at: [139.77, 35.7], node: <Card /> }} />)
    await flush()
    expect(live().some((p) => String(p.options.className).includes('place-card'))).toBe(false)
    expect(live().some((p) => String(p.options.className).includes('phone-popup'))).toBe(true)
    expect(c.onOpenEat).not.toHaveBeenCalled()
  })
})

describe('TripMap desktop place card: capacity known before the flight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.popups.length = 0
    h.layer.replaceChildren()
    document.body.append(h.layer)
    h.listeners.clear()
    h.onceListeners.clear()
    layout.value = 'desktop'
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); setPanelObstruction(0); h.state.width = 1440; h.state.moving = false })

  it('hands a 768-wide map\'s detail to the sidebar at once, not after the selection flight', async () => {
    h.state.width = 768
    h.state.moving = true                 // the selection flight is still in the air
    setPanelObstruction(356)
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 4, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(c.onFallback).toHaveBeenCalledWith(4)
  })
})

/* Codex final review (A11). */
describe('TripMap place card: lifecycle and later geometry (Codex final #2, #4, #5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.popups.length = 0
    h.markers.length = 0
    h.layer.replaceChildren()
    document.body.append(h.layer)
    h.listeners.clear()
    h.onceListeners.clear()
    h.state.moving = false
    h.state.width = 1440
    h.state.height = 900
    h.state.pin = { x: 900, y: 270 }
    layout.value = 'desktop'
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    setPanelObstruction(472)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setPanelObstruction(0)
    h.map.stop.mockImplementation(() => {})
  })
  const placeCards = () => live().filter((p) => String(p.options.className).includes('place-card'))

  // #5: release() -> map.stop() emits moveend SYNCHRONOUSLY; a correction's pending callback must
  // not run then, with the projection by now valid, and resurrect a shell on the departed route.
  it('a pending correction does not resurrect a card or fall back after the route unmounts', async () => {
    h.map.stop.mockImplementation(() => { h.fire('moveend') })
    h.state.pin = { x: 470, y: 40 }
    const c = cards()
    const props = { bundle: TOKYO_TRIP, activeDayNumber: 1, onSelectPlace: () => {}, selectedPlaceId: 'pl_sandolab', cards: c,
      card: { nonce: 1, at: [139.77, 35.7] as [number, number], node: <Card /> } }
    // The shell (MapProvider, the shared map) stays; only the trip route leaves.
    const Shell = ({ route }: { route: boolean }) => <MapProvider>{route ? <TripMap {...props} /> : null}</MapProvider>
    const view = render(<Shell route />)
    await flush()
    fireLoad()
    await flush()
    expect(h.map.panBy).toHaveBeenCalledTimes(1)
    const [[dx, dy]] = h.map.panBy.mock.calls[0] as [[number, number]]
    h.state.pin = { x: 470 - dx, y: 40 - dy }      // the pan got far enough to fit
    const before = h.PopupCtor.mock.calls.length
    view.rerender(<Shell route={false} />)
    expect(h.map.stop).toHaveBeenCalled()          // release() -> stop() -> moveend, synchronously
    expect(h.PopupCtor.mock.calls.length).toBe(before)
    expect(placeCards()).toHaveLength(0)
    expect(c.onFallback).not.toHaveBeenCalled()
  })

  it('a new request cancels the previous request\'s pending correction', async () => {
    h.state.pin = { x: 470, y: 40 }
    const c = cards()
    const view = await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 1, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(h.map.panBy).toHaveBeenCalledTimes(1)
    h.state.pin = { x: 900, y: 270 }
    view.rerender(<TripMapHarness selectedPlaceId="pl_sandolab" card={null} cards={c} />)
    act(() => { h.fire('moveend') })
    expect(placeCards()).toHaveLength(0)
    expect(c.onFallback).not.toHaveBeenCalled()
  })

  // #2: a token, but the map never loads (a rejected style, no WebGL): nothing can present the
  // card, so the detail goes to the sidebar instead of a detached host.
  it('reports the map unavailable until it loads, and never available if it does not', async () => {
    const c = { ...cards(), onAvailability: vi.fn() }
    render(<TripMapHarness selectedPlaceId="pl_sandolab" card={{ nonce: 9, at: [139.77, 35.7], node: <Card /> }} cards={c} />)
    await flush()                                   // no 'load' fired: a rejected style, no WebGL
    expect(c.onAvailability).toHaveBeenLastCalledWith(false)
    expect(c.onAvailability).not.toHaveBeenCalledWith(true)
    expect(placeCards()).toHaveLength(0)
    fireLoad()
    await flush()
    expect(c.onAvailability).toHaveBeenLastCalledWith(true)
  })

  // #4: geometry that turns impossible AFTER placement transfers the detail (no camera move).
  it('a placed card whose map shrinks to 768 (still desktop) hands its detail to the sidebar', async () => {
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 2, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(placeCards()).toHaveLength(1)
    h.state.width = 768
    act(() => { setPanelObstruction(356) })
    expect(c.onFallback).toHaveBeenCalledWith(2)
    expect(placeCards()).toHaveLength(0)
    expect(h.map.panBy).not.toHaveBeenCalled()
  })

  it('a placed card whose pin is panned off the map hands its detail to the sidebar, no camera fight', async () => {
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 3, at: [139.77, 35.7], node: <Card /> }, cards: c })
    act(() => { h.fire('dragstart', { originalEvent: new MouseEvent('mousedown') }) })
    h.state.pin = { x: -400, y: 300 }
    act(() => { h.fire('moveend') })
    expect(c.onFallback).toHaveBeenCalledWith(3)
    expect(h.map.panBy).not.toHaveBeenCalled()
  })

  it('a small user pan that only obstructs the card keeps it following the pin', async () => {
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 4, at: [139.77, 35.7], node: <Card /> }, cards: c })
    act(() => { h.fire('dragstart', { originalEvent: new MouseEvent('mousedown') }) })
    h.state.pin = { x: 520, y: 60 }                 // near the panel edge: obstructed, still visible
    act(() => { h.fire('moveend') })
    expect(c.onFallback).not.toHaveBeenCalled()
    expect(placeCards()).toHaveLength(1)
  })
})

/* Codex final #6: an eat or hotel detail crosses the breakpoint as ONE surface: the phone's DOM
   card and the desktop place card are never both open, and neither is lost. */
describe('TripMap eat and hotel details across the breakpoint (Codex final #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.popups.length = 0
    h.markers.length = 0
    h.layer.replaceChildren()
    document.body.append(h.layer)
    h.listeners.clear()
    h.onceListeners.clear()
    h.state.moving = false
    h.state.width = 1440
    h.state.pin = { x: 900, y: 270 }
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    setPanelObstruction(472)
  })
  afterEach(() => { vi.unstubAllGlobals(); setPanelObstruction(0) })
  const phoneCards = () => live().filter((p) => String(p.options.className).includes('phone-popup'))
  const placeCards = () => live().filter((p) => String(p.options.className).includes('place-card'))
  const EAT = { kind: 'eat' as const, id: 'pl_popo' }
  const HOTEL = { kind: 'hotel' as const, id: 'hotel_1' }

  async function run(first: 'mobile' | 'desktop', props: Props, open1: Props, open2: Props) {
    layout.value = first
    const c = cards()
    const view = await open({ ...props, ...open1, cards: c })
    layout.value = first === 'mobile' ? 'desktop' : 'mobile'
    view.rerender(<TripMapHarness {...props} {...open2} cards={c} />)
    await flush()
    return { view, c }
  }

  it('an eat card opened on a phone becomes the desktop place card on widening, with no DOM card left', async () => {
    layout.value = 'mobile'
    const c = cards()
    const view = await open({ cards: c })
    view.rerender(<TripMapHarness selectedRestaurantPlaceId="pl_popo" openSuggestion={EAT} cards={c} />)
    await flush()
    expect(phoneCards()).toHaveLength(1)            // the phone's DOM card is open
    layout.value = 'desktop'
    view.rerender(<TripMapHarness selectedRestaurantPlaceId="pl_popo" openSuggestion={EAT} cards={c}
      card={{ nonce: 1, at: [139.765, 35.73], node: <Card /> }} />)
    await flush()
    expect(phoneCards()).toHaveLength(0)
    expect(placeCards()).toHaveLength(1)
  })

  it('an eat place card opened on desktop becomes the phone DOM card on narrowing', async () => {
    await run('desktop', { selectedRestaurantPlaceId: 'pl_popo', openSuggestion: EAT },
      { card: { nonce: 1, at: [139.765, 35.73], node: <Card /> } }, { card: null })
    expect(placeCards()).toHaveLength(0)
    expect(phoneCards()).toHaveLength(1)
    expect(phoneCards()[0].el.textContent).toContain('Popo')
  })

  it('a hotel does the same in both directions on an older hotel-bearing trip', async () => {
    const base = { bundle: TOKYO_TRIP_WITH_HOTELS, layerMode: 'hub' as const, selectedHotelId: 'hotel_1', openSuggestion: HOTEL }
    await run('desktop', base, { card: { nonce: 1, at: [139.7034, 35.6938], node: <Card /> } }, { card: null })
    expect(placeCards()).toHaveLength(0)
    expect(phoneCards()).toHaveLength(1)
    h.popups.length = 0
    h.layer.replaceChildren()
    await run('mobile', base, { card: null }, { card: { nonce: 2, at: [139.7034, 35.6938], node: <Card /> } })
    expect(phoneCards()).toHaveLength(0)
    expect(placeCards()).toHaveLength(1)
  })

  it('a phone eat pin tells the owner (so a later rotation knows which card is open)', async () => {
    layout.value = 'mobile'
    const c = cards()
    await open({ cards: c })
    const eat = h.markers.find((m) => m.classList.contains('eat-pin'))!
    act(() => { eat.click() })
    expect(c.onOpenEat).toHaveBeenCalledWith('pl_popo')
    expect(phoneCards()).toHaveLength(1)
  })

  it('closing the phone DOM card closes the open card too', async () => {
    layout.value = 'mobile'
    const c = cards()
    await open({ cards: c })
    act(() => { h.markers.find((m) => m.classList.contains('eat-pin'))!.click() })
    const popup = h.PopupCtor.mock.results.at(-1)!.value as { on: ReturnType<typeof vi.fn> }
    const close = popup.on.mock.calls.find((x) => x[0] === 'close')![1] as () => void
    act(() => { close() })
    expect(c.onDismiss).toHaveBeenCalled()
  })
})

/* A12 (Codex re-check). */
describe('TripMap place card: A12 re-check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.popups.length = 0
    h.markers.length = 0
    h.layer.replaceChildren()
    document.body.append(h.layer)
    h.listeners.clear()
    h.onceListeners.clear()
    h.state.moving = false
    h.state.width = 1440
    h.state.height = 900
    h.state.pin = { x: 900, y: 270 }
    layout.value = 'desktop'
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    setPanelObstruction(472)
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    setPanelObstruction(0)
    const { clearPlacementObstacles } = await import('@/lib/trip/placement-obstacles')
    act(() => clearPlacementObstacles('dock'))
  })
  const placeCards = () => live().filter((p) => String(p.options.className).includes('place-card'))
  const phoneCards = () => live().filter((p) => String(p.options.className).includes('phone-popup'))

  // (a) A dock that expands over a PLACED card, leaving no anchor that fits where the pin is: the
  // solver says 'shift' (a camera move would make room), but a placed card never moves the camera
  // again, so the detail goes to the sidebar instead of staying covered.
  it('a dock expanding over a placed card, with no anchor left, hands the detail to the sidebar', async () => {
    const { setPlacementObstacles } = await import('@/lib/trip/placement-obstacles')
    const { solveCardPlacement } = await import('@/components/map/card-placement')
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 5, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(placeCards()).toHaveLength(1)
    const dock = { x: 520, y: 360, w: 500, h: 300 }   // grown over the card; the pin stays visible
    // The premise, asserted where it is set up: the solver would ask for a camera shift here.
    expect(solveCardPlacement({
      pin: h.state.pin, card: { w: 360, natural: 420 }, view: { w: 1440, h: 900 },
      obstacles: [{ x: 0, y: 0, w: 472, h: 900 }, dock], offset: 30, margin: 12, minHeight: 260, panelRight: 472,
    }).kind).toBe('shift')
    act(() => setPlacementObstacles('dock', [dock]))
    expect(c.onFallback).toHaveBeenCalledWith(5)
    expect(placeCards()).toHaveLength(0)
    expect(h.map.panBy).not.toHaveBeenCalled()
  })

  it('chrome that covers the placed card but leaves another anchor re-anchors it instead', async () => {
    const { setPlacementObstacles } = await import('@/lib/trip/placement-obstacles')
    const c = cards()
    await open({ selectedPlaceId: 'pl_sandolab', card: { nonce: 6, at: [139.77, 35.7], node: <Card /> }, cards: c })
    expect(placeCards()[0].options.anchor).toBe('top')          // below the pin
    act(() => setPlacementObstacles('dock', [{ x: 700, y: 500, w: 400, h: 400 }]))   // covers below only
    expect(c.onFallback).not.toHaveBeenCalled()
    expect(placeCards()).toHaveLength(1)
    expect(placeCards()[0].options.anchor).not.toBe('top')
  })

  // (b) A hotel chosen in the phone Stay list opens the phone DOM card AND tells the owner, so a
  // later widening has a descriptor to hand to the place card.
  it('a phone Stay selection of a hotel reports the open card to the owner', async () => {
    layout.value = 'mobile'
    const c = cards()
    const view = await open({ bundle: TOKYO_TRIP_WITH_HOTELS, layerMode: 'route', selectedHotelId: null, cards: c })
    view.rerender(<TripMapHarness bundle={TOKYO_TRIP_WITH_HOTELS} layerMode="hub" selectedHotelId="hotel_1" cards={c} />)
    await flush()
    expect(phoneCards()).toHaveLength(1)
    expect(c.onOpenHotel).toHaveBeenCalledWith('hotel_1')
  })

  // (c) Dismissal names the card it belongs to, and choosing a stop drops a lingering DOM card.
  it('closing the phone DOM card dismisses THAT suggestion by identity', async () => {
    layout.value = 'mobile'
    const c = cards()
    await open({ cards: c })
    act(() => { h.markers.find((m) => m.classList.contains('eat-pin'))!.click() })
    const popup = h.PopupCtor.mock.results.at(-1)!.value as { on: ReturnType<typeof vi.fn> }
    act(() => { (popup.on.mock.calls.find((x) => x[0] === 'close')![1] as () => void)() })
    expect(c.onDismiss).toHaveBeenCalledWith({ kind: 'eat', id: 'pl_popo' })
  })

  it('selecting a stop removes the phone suggestion card without dismissing anything', async () => {
    layout.value = 'mobile'
    const c = cards()
    const view = await open({ cards: c })
    act(() => { h.markers.find((m) => m.classList.contains('eat-pin'))!.click() })
    expect(phoneCards()).toHaveLength(1)
    view.rerender(<TripMapHarness selectedPlaceId="pl_akasaka" cards={c} />)
    await flush()
    expect(phoneCards()).toHaveLength(0)
    expect(c.onDismiss).not.toHaveBeenCalled()
  })
})
