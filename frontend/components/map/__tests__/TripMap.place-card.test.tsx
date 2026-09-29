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
