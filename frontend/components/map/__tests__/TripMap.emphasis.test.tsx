import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'
import MapProvider from '@/components/map/MapProvider'
import TripMap from '@/components/map/TripMap'
import { ACTIVE_CASING, ACTIVE_CORE, CHEVRONS, CHEVRON_IMAGE, TRAIL_CORE } from '@/components/map/day-emphasis'

/* Plan v2 amendments 6, 7 and 10: the desktop active-day emphasis. Layers, filters, paint and the
   marker DOM are observed through a map mock that keeps a real layer registry. */

const { mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markerElements, popups, layers, handlers, images } = vi.hoisted(() => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const layers = new Map<string, Record<string, unknown>>()
  const images = new Set<string>()
  const handlers = new Map<string, Set<(...a: unknown[]) => void>>()
  const mapInstance = {
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev)!.add(fn) }),
    off: vi.fn((ev: string, fn: (...a: unknown[]) => void) => { handlers.get(ev)?.delete(fn) }),
    once: vi.fn(),
    getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900 })),
    getContainer: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900, getBoundingClientRect: () => ({ left: 0, top: 0 }), style: { setProperty: vi.fn(), removeProperty: vi.fn() } })),
    // A linear projection good enough for label geometry: Tokyo spread over the canvas.
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: (lng - 139.6) * 4000, y: (35.75 - lat) * 4000 })),
    addSource: vi.fn(), getSource: vi.fn((_id?: string) => undefined),
    addLayer: vi.fn((l: Record<string, unknown>) => { layers.set(l.id as string, { ...l }) }),
    getLayer: vi.fn((id: string) => layers.get(id)),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    removeSource: vi.fn(),
    setFilter: vi.fn((id: string, f: unknown) => { const l = layers.get(id); if (l) l.filter = f }),
    setPaintProperty: vi.fn((id: string, k: string, v: unknown) => { const l = layers.get(id); if (l) l.paint = { ...(l.paint as object), [k]: v } }),
    setLayoutProperty: vi.fn((id: string, k: string, v: unknown) => { const l = layers.get(id); if (l) l.layout = { ...(l.layout as object), [k]: v } }),
    hasImage: vi.fn((id: string) => images.has(id)),
    addImage: vi.fn((id: string) => { images.add(id) }),
    removeImage: vi.fn((id: string) => { images.delete(id) }),
    flyTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(), jumpTo: vi.fn(), setConfigProperty: vi.fn(),
    isMoving: vi.fn(() => false), setPadding: vi.fn(),
    remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  const MapCtor = vi.fn(() => mapInstance)
  const markerElements: HTMLElement[] = []
  const MarkerCtor = vi.fn((options: { element: HTMLElement }) => {
    markerElements.push(options.element)
    const marker = { setLngLat: vi.fn(() => marker), addTo: vi.fn(() => marker), remove: vi.fn() }
    return marker
  })
  const popups: { className: string; removed: boolean; el: HTMLElement | null }[] = []
  const PopupCtor = vi.fn((opts: { className: string }) => {
    const rec = { className: opts.className, removed: false, el: null as HTMLElement | null }
    popups.push(rec)
    const popup = {
      setLngLat: vi.fn(() => popup),
      setDOMContent: vi.fn((el: HTMLElement) => { rec.el = el; return popup }),
      addTo: vi.fn(() => popup),
      remove: vi.fn(() => { rec.removed = true }),
    }
    return popup
  })
  const BoundsCtor = vi.fn(() => ({ extend: vi.fn() }))
  return { mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markerElements, popups, layers, handlers, images }
})

vi.mock('mapbox-gl', () => ({
  default: { Map: MapCtor, Marker: MarkerCtor, Popup: PopupCtor, LngLatBounds: BoundsCtor, accessToken: '' },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('@/lib/trip/safe-area', () => ({ readSafeAreaTop: () => 0 }))

let mobile = false
const mqListeners = new Set<() => void>()
const setMobile = (next: boolean) => { mobile = next; act(() => { mqListeners.forEach((l) => l()) }) }

function fire(ev: string) {
  act(() => { handlers.get(ev)?.forEach((fn) => fn()) })
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

type Props = Partial<Parameters<typeof TripMap>[0]>
function view(props: Props = {}) {
  const el = (p: Props, gone = false) => (
    <MapProvider>
      {gone ? null : <TripMap bundle={TOKYO_TRIP} activeDayNumber={1} selectedPlaceId={null} onSelectPlace={() => {}} {...props} {...p} />}
    </MapProvider>
  )
  const r = render(el({}))
  // leave(): the trip route goes while the shell's shared map stays (the real navigation case).
  return { ...r, update: (p: Props) => r.rerender(el(p)), leave: () => r.rerender(el({}, true)) }
}

async function loaded(props: Props = {}) {
  const v = view(props)
  await flush()
  fire('load')
  await flush()
  return v
}

const pin = (name: string) => markerElements.filter((e) => e.getAttribute('aria-label') === name).at(-1)!
const pinsFor = (day: number, bundle: TripBundle = TOKYO_TRIP) => placesForDay(bundle, day).map((tp) => pin(tp.place.name))
const pillShown = (el: HTMLElement) => {
  const p = el.querySelector<HTMLElement>('.phone-pin__name')
  return p !== null && !p.hidden
}
const onDay = (d: number) => ['==', ['get', 'day_number'], d]

beforeEach(() => {
  vi.clearAllMocks()
  markerElements.length = 0
  popups.length = 0
  layers.clear(); handlers.clear(); images.clear(); mqListeners.clear()
  mobile = false
  mapInstance.getZoom.mockReturnValue(13)
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return query.includes('hover') ? !mobile : query.includes('max-width') ? mobile : false },
    media: query, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { mqListeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { mqListeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('desktop active-day route emphasis', () => {
  it('adds casing, core and chevrons on the trail source, filtered to the active day; the rest dims', async () => {
    await loaded()
    for (const id of [ACTIVE_CASING, ACTIVE_CORE, CHEVRONS]) {
      const l = layers.get(id)!
      expect(l.source).toBe('trip-trail')
      expect(l.filter).toEqual(onDay(1))
      expect((l.layout as Record<string, unknown>).visibility).toBe('visible')
    }
    expect((layers.get(ACTIVE_CORE)!.paint as Record<string, number>)['line-width']).toBeGreaterThanOrEqual(5)
    expect(layers.get(CHEVRONS)!.type).toBe('symbol')
    expect(images.has(CHEVRON_IMAGE)).toBe(true)
    expect(layers.get(TRAIL_CORE)!.filter).toEqual(['!=', ['get', 'day_number'], 1])
    expect((layers.get(TRAIL_CORE)!.paint as Record<string, number>)['line-opacity']).toBeLessThan(0.5)
  })

  it('a day switch with no selection re-filters: no new source, no marker rebuild, other days dimmed', async () => {
    const v = await loaded()
    const sources = mapInstance.addSource.mock.calls.length
    const built = MarkerCtor.mock.calls.length
    expect(pinsFor(2).every((el) => el.classList.contains('phone-pin--dimmed'))).toBe(true)
    expect(pinsFor(1).some((el) => el.classList.contains('phone-pin--dimmed'))).toBe(false)
    v.update({ activeDayNumber: 2 })
    await flush()
    expect(mapInstance.addSource.mock.calls.length).toBe(sources)
    expect(MarkerCtor.mock.calls.length).toBe(built)
    expect(layers.get(ACTIVE_CORE)!.filter).toEqual(onDay(2))
    expect(layers.get(CHEVRONS)!.filter).toEqual(onDay(2))
    expect(pinsFor(1).every((el) => el.classList.contains('phone-pin--dimmed'))).toBe(true)
    expect(pinsFor(2).some((el) => el.classList.contains('phone-pin--dimmed'))).toBe(false)
  })

  it('route → hub → route removes the emphasis with the trail and restores it', async () => {
    const v = await loaded({ bundle: TOKYO_TRIP_WITH_HOTELS, selectedHotelId: 'hotel_1' })
    expect(layers.has(CHEVRONS)).toBe(true)
    v.update({ bundle: TOKYO_TRIP_WITH_HOTELS, selectedHotelId: 'hotel_1', layerMode: 'hub' })
    await flush()
    for (const id of [ACTIVE_CASING, ACTIVE_CORE, CHEVRONS]) expect(layers.has(id)).toBe(false)
    v.update({ bundle: TOKYO_TRIP_WITH_HOTELS, selectedHotelId: 'hotel_1', layerMode: 'route' })
    await flush()
    expect(layers.get(CHEVRONS)!.filter).toEqual(onDay(1))
    expect((layers.get(CHEVRONS)!.layout as Record<string, unknown>).visibility).toBe('visible')
  })

  it('leaving the page removes the emphasis layers and the chevron image from the shared map', async () => {
    const v = await loaded()
    v.leave()
    for (const id of [ACTIVE_CASING, ACTIVE_CORE, CHEVRONS, TRAIL_CORE]) expect(layers.has(id)).toBe(false)
    expect(images.has(CHEVRON_IMAGE)).toBe(false)
    expect(handlers.get('moveend')?.size ?? 0).toBe(0)
  })

  it('a refreshed itinerary redraws pins from the new bundle and keeps the emphasis', async () => {
    const v = await loaded()
    const renamed: TripBundle = {
      ...TOKYO_TRIP,
      places: TOKYO_TRIP.places.map((tp, i) => (i === 0 ? { ...tp, place: { ...tp.place, name: 'Renamed Stop' } } : tp)),
    }
    v.update({ bundle: renamed })
    await flush()
    expect(pin('Renamed Stop')).toBeTruthy()
    expect(layers.get(ACTIVE_CORE)!.filter).toEqual(onDay(1))
  })
})

describe('desktop name pills (zoom >= 11)', () => {
  it('appear for the active day only at zoom 11, and go at 10.9, on moveend', async () => {
    mapInstance.getZoom.mockReturnValue(10.9)
    await loaded()
    expect(pinsFor(1).some(pillShown)).toBe(false)
    mapInstance.getZoom.mockReturnValue(11)
    fire('moveend')
    expect(pinsFor(1).some(pillShown)).toBe(true)
    expect(pinsFor(2).some(pillShown)).toBe(false)
    mapInstance.getZoom.mockReturnValue(10.9)
    fire('moveend')
    expect(pinsFor(1).some(pillShown)).toBe(false)
  })

  it('rotation to phone undoes dimming and added pills, and back again restores them', async () => {
    await loaded()
    expect(pinsFor(1).some(pillShown)).toBe(true)
    setMobile(true)
    await flush()
    expect(markerElements.some((el) => el.classList.contains('phone-pin--dimmed'))).toBe(false)
    expect(pinsFor(1).some(pillShown)).toBe(false)
    expect((layers.get(ACTIVE_CORE)!.layout as Record<string, unknown>).visibility).toBe('none')
    expect(layers.get(TRAIL_CORE)!.filter).toBeNull()
    setMobile(false)
    await flush()
    expect(pinsFor(1).some(pillShown)).toBe(true)
    expect((layers.get(ACTIVE_CORE)!.layout as Record<string, unknown>).visibility).toBe('visible')
  })

  it('phone keeps its selected-only pill and no emphasis', async () => {
    mobile = true
    const stop = placesForDay(TOKYO_TRIP, 1)[1]
    await loaded({ selectedPlaceId: stop.place_id })
    const withPill = markerElements.filter(pillShown)
    expect(withPill.map((e) => e.getAttribute('aria-label'))).toEqual([stop.place.name])
    expect((layers.get(ACTIVE_CORE)!.layout as Record<string, unknown>).visibility).toBe('none')
  })
})

describe('desktop hover preview', () => {
  const hoverPopups = () => popups.filter((p) => p.className.includes('pin-hover-popup'))
  const enter = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('mouseenter')) })
  const leave = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('mouseleave')) })

  // A10 (brief item 6, Codex §5): the hover card is removed on desktop. The active day's name
  // pills name the pins, and the click opens the place card at the pin; a hover card would only
  // compete with it. Replaces the A9 "shows on hover / removed on redraw" tests.
  it('opens no hover card on desktop: a pin under the pointer shows nothing extra; a click selects', async () => {
    const onSelectPlace = vi.fn()
    await loaded({ onSelectPlace })
    const stop = placesForDay(TOKYO_TRIP, 2)[0]
    enter(pin(stop.place.name))
    expect(popups).toHaveLength(0)
    leave(pin(stop.place.name))
    act(() => { pin(stop.place.name).click() })
    expect(popups).toHaveLength(0)
    expect(onSelectPlace).toHaveBeenCalledWith(stop.place_id)
  })

  it('never coexists with an open eat popup, and never shows on a phone', async () => {
    await loaded()
    const eat = markerElements.filter((e) => e.classList.contains('eat-pin')).at(-1)!
    act(() => { eat.click() })
    const name = placesForDay(TOKYO_TRIP, 1)[0].place.name
    enter(pin(name))
    expect(hoverPopups()).toHaveLength(0)
    setMobile(true)
    await flush()
    act(() => { document.body.click() })
    enter(pin(name))
    expect(hoverPopups()).toHaveLength(0)
  })
})
