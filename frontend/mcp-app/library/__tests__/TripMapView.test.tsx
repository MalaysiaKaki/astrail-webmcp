import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import MapProvider from '@/components/map/MapProvider'
import { forceTripLayout } from '@/lib/trip/use-trip-layout'
import { setSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { getControlRects } from '@/lib/trip/control-obstruction'
import type { ItineraryResponse } from '@/lib/mcp/contract'
import {
  CAPPED_QUOTES_RESPONSE, FIXTURE_IDS, MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE,
} from '../../src/__fixtures__/multi-source-bundle'
import { widgetData } from '../../src/__tests__/tool-results'
import TripMapView from '../TripMapView'

/* mapbox-gl mocked as components/map/__tests__/TripMap.test.tsx does, plus live layer/source sets
   so teardown is observable: getLayer answers from what was really added and not yet removed. */
const gl = vi.hoisted(() => {
  const layers = new Set<string>()
  const sources = new Set<string>()
  // Live listener registry: on/once add, off removes, so a listener left behind is visible.
  const listeners = new Map<string, Set<unknown>>()
  const add = (event: string, fn: unknown) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(fn)
  }
  // Terrain and fog as state, so camera-mode's real controller runs and its result is readable.
  const atmosphere: { terrain: { source: string } | null; fog: unknown; fogThrows: number } = {
    terrain: null, fog: null, fogThrows: 0,
  }
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const mapInstance = {
    on: vi.fn(add), once: vi.fn(add),
    off: vi.fn((event: string, fn: unknown) => { listeners.get(event)?.delete(fn) }),
    getTerrain: vi.fn(() => atmosphere.terrain),
    setTerrain: vi.fn((t: { source: string } | null) => { atmosphere.terrain = t }),
    getFog: vi.fn(() => atmosphere.fog),
    setFog: vi.fn((f: unknown) => {
      // "Style is not done loading": the controller defers the rest of its step to 'idle'.
      if (atmosphere.fogThrows > 0) { atmosphere.fogThrows--; throw new Error('style not done loading') }
      atmosphere.fog = f
    }),
    getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: 390, clientHeight: 844 })),
    addSource: vi.fn((id: string) => { sources.add(id) }),
    addLayer: vi.fn((layer: { id: string }) => { layers.add(layer.id) }),
    getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    setFilter: vi.fn(), setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(),
    flyTo: vi.fn(), fitBounds: vi.fn(), jumpTo: vi.fn(), setConfigProperty: vi.fn(),
    easeTo: vi.fn(), isMoving: vi.fn(() => false), setPadding: vi.fn(),
    getContainer: vi.fn(() => ({ clientWidth: 390, clientHeight: 844 })),
    remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  const MapCtor = vi.fn((_options: { center: [number, number] }) => mapInstance)
  const markers: { el: HTMLElement; remove: ReturnType<typeof vi.fn> }[] = []
  const MarkerCtor = vi.fn((options: { element: HTMLElement }) => {
    const marker = { setLngLat: vi.fn(() => marker), addTo: vi.fn(() => marker), remove: vi.fn() }
    markers.push({ el: options.element, remove: marker.remove })
    return marker
  })
  const PopupCtor = vi.fn(() => {
    const popup = {
      setLngLat: vi.fn(() => popup), setDOMContent: vi.fn(() => popup), addTo: vi.fn(() => popup),
      remove: vi.fn(), on: vi.fn(), getElement: vi.fn(() => null),
    }
    return popup
  })
  const BoundsCtor = vi.fn(() => ({ extend: vi.fn() }))
  return { layers, sources, listeners, atmosphere, mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markers }
})

vi.mock('mapbox-gl', () => ({
  default: {
    Map: gl.MapCtor, Marker: gl.MarkerCtor, Popup: gl.PopupCtor, LngLatBounds: gl.BoundsCtor, accessToken: '',
  },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function fireLoad() {
  const load = gl.mapInstance.on.mock.calls.find((c) => c[0] === 'load')
  act(() => { (load?.[1] as () => void)?.() })
}

const pin = (name: string) => gl.markers.find((m) => m.el.getAttribute('aria-label') === name)?.el
const liveMarkers = () => gl.markers.filter((m) => m.remove.mock.calls.length === 0)
/** Every registered listener, per event, as counts (what the provider owns stays; a route's must go). */
const listenerCounts = () => Object.fromEntries([...gl.listeners].map(([e, fns]) => [e, fns.size]).filter(([, n]) => n))
const stops = () => within(screen.getByRole('list', { name: 'Stops' }))

/** Opens one trip on a loaded map: the import resolves, the map loads, the pins are drawn. */
async function open(response: ItineraryResponse = MULTI_SOURCE_RESPONSE) {
  const props = { onBack: vi.fn(), onDayChange: vi.fn() }
  const view = render(
    <MapProvider accessToken="pk.test">
      <TripMapView data={widgetData(response)} {...props} />
    </MapProvider>,
  )
  await flush()
  fireLoad()
  await flush()
  return { ...view, props }
}

beforeEach(() => {
  vi.clearAllMocks()
  gl.layers.clear()
  gl.sources.clear()
  gl.markers.length = 0
  gl.listeners.clear()
  gl.atmosphere.terrain = null
  gl.atmosphere.fog = null
  gl.atmosphere.fogThrows = 0
  forceTripLayout('mobile')
  // TripMap frames in a requestAnimationFrame; run it synchronously (as TripMap.test does).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  forceTripLayout(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setSheetObstruction(0)
})

describe('TripMapView', () => {
  it('renders the title, the day strip and the first day\'s stops', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Tokyo in three Reels' })).toBeInTheDocument()
    const strip = screen.getByRole('group', { name: 'Trip days' })
    expect(within(strip).getAllByRole('button', { name: /^Day \d/ })).toHaveLength(3)
    expect(stops().getByText('Sensō-ji')).toBeInTheDocument()
    expect(stops().getByText('Kappabashi Kitchen Street')).toBeInTheDocument()
    expect(pin('Sensō-ji')).toBeDefined()
  })

  it('is a viewer, not the sample: no Sample badge, no saved-example copy, no feedback row', async () => {
    await open()
    expect(screen.queryByText('Sample')).toBeNull()
    expect(screen.queryByText(/saved example/i)).toBeNull()
    expect(screen.queryByText('How was this trail?')).toBeNull()
    // Complete and not read-only: the website would show the feedback row here. Only null hides it.
    expect(MULTI_SOURCE_RESPONSE.bundle.trip.status).toBe('complete')
  })

  it('a day change updates the timeline and reports the day; opening reports nothing', async () => {
    const { props } = await open()
    expect(props.onDayChange).not.toHaveBeenCalled()
    act(() => { screen.getByRole('button', { name: /^Day 2,/ }).click() })
    expect(stops().getByText('teamLab Planets')).toBeInTheDocument()
    expect(stops().queryByText('Sensō-ji')).toBeNull()
    expect(props.onDayChange.mock.calls).toEqual([[{ trip_id: FIXTURE_IDS.trip, day: 2 }]])
    act(() => { screen.getByRole('button', { name: /^Day 1,/ }).click() })
    expect(props.onDayChange).toHaveBeenLastCalledWith({ trip_id: FIXTURE_IDS.trip, day: 1 })
  })

  it('a pin on another day switches to that day, selects the stop and reports the day', async () => {
    const { props } = await open()
    act(() => { pin('teamLab Planets')!.click() })
    const card = stops().getByText('teamLab Planets').closest('[data-place-id]')
    expect(card).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /^Day 2,/ })).toHaveAttribute('aria-current', 'true')
    expect(props.onDayChange.mock.calls).toEqual([[{ trip_id: FIXTURE_IDS.trip, day: 2 }]])
  })

  it('a list tap selects the stop', async () => {
    await open()
    const card = stops().getByText('Nakamise-dori').closest('[data-place-id]')!
    expect(card).not.toHaveAttribute('aria-current')
    act(() => { (card as HTMLElement).click() })
    expect(card).toHaveAttribute('aria-current', 'true')
  })

  it('the back button calls onBack, is a measured map control, and clears the host inset', async () => {
    const { props } = await open()
    const back = screen.getByRole('button', { name: 'Back to all trips' })
    expect(back).toHaveAttribute('data-map-control')
    expect(back.className).toContain('top-[max(12px,var(--safe-top,0px))]')
    expect(back.className).toContain('m-btn-icon')
    expect(back).toHaveStyle({ width: '48px', height: '48px' })
    expect(back.textContent).toBe('')
    act(() => { back.click() })
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('says when the view is partial (stops or quotes cut), and not when it is whole', async () => {
    const stopsCut: ItineraryResponse = {
      ...MULTI_SOURCE_RESPONSE, truncated: { ...MULTI_SOURCE_RESPONSE.truncated, stops: true },
    }
    for (const response of [stopsCut, CAPPED_QUOTES_RESPONSE]) {
      await open(response)
      expect(screen.getByRole('note')).toHaveTextContent('Showing part of this trip (3 of 3 days). Open it in Astrail for everything.')
      cleanup()
    }
    await open()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('lists a place with no coordinates — even the first one — without pinning it, on a finite camera', async () => {
    const unlocated: ItineraryResponse = {
      ...MULTI_SOURCE_RESPONSE,
      bundle: {
        ...MULTI_SOURCE_RESPONSE.bundle,
        places: MULTI_SOURCE_RESPONSE.bundle.places.map((tp, i) => (i === 0
          ? { ...tp, place: { ...tp.place, lat: 0, lng: 0 } }
          : tp)),
      },
    }
    expect(unlocated.bundle.places[0].place.name).toBe('Sensō-ji')
    await open(unlocated)
    expect(stops().getByText('Sensō-ji')).toBeInTheDocument()
    expect(pin('Sensō-ji')).toBeUndefined()
    expect(pin('Nakamise-dori')).toBeDefined()
    expect(gl.MapCtor).toHaveBeenCalledTimes(1)
    expect(gl.MapCtor.mock.calls[0][0].center.every(Number.isFinite)).toBe(true)
    for (const [options] of gl.mapInstance.jumpTo.mock.calls as unknown as [{ center?: number[] }][]) {
      if (options.center) expect(options.center.every(Number.isFinite)).toBe(true)
    }
  })

  it('A -> Back -> B, twice, on one shared map: every pin and layer of a trip goes before the next arrives', async () => {
    const props = { onBack: vi.fn(), onDayChange: vi.fn() }
    const A = widgetData(MULTI_SOURCE_RESPONSE)
    const B = widgetData(OTHER_TRIP_RESPONSE)
    const view = render(<MapProvider accessToken="pk.test">{null}</MapProvider>)
    let first = true
    for (const data of [A, B, A, B]) {
      view.rerender(
        <MapProvider accessToken="pk.test">
          <TripMapView data={data} {...props} />
        </MapProvider>,
      )
      await flush()
      if (first) { fireLoad(); first = false }
      await flush()
      expect(screen.getByRole('heading', { name: data.bundle.trip.title! })).toBeInTheDocument()
      expect(liveMarkers().length).toBeGreaterThan(0)
      expect(gl.layers.size).toBeGreaterThan(0)

      view.rerender(<MapProvider accessToken="pk.test">{null}</MapProvider>)   // Back to the list
      await flush()
      expect(liveMarkers()).toHaveLength(0)
      expect([...gl.layers]).toEqual([])
      expect([...gl.sources]).toEqual([])
    }
    expect(gl.MapCtor).toHaveBeenCalledTimes(1)
    expect(gl.mapInstance.remove).not.toHaveBeenCalled()
  })

  it('A in 3D with a deferred ease and a deferred terrain step -> Back -> B: no listener, terrain, layer or source survives', async () => {
    const props = { onBack: vi.fn(), onDayChange: vi.fn() }
    const view = render(<MapProvider accessToken="pk.test">{null}</MapProvider>)
    const show = (response: ItineraryResponse) => view.rerender(
      <MapProvider accessToken="pk.test"><TripMapView data={widgetData(response)} {...props} /></MapProvider>,
    )
    const back = () => view.rerender(<MapProvider accessToken="pk.test">{null}</MapProvider>)

    show(MULTI_SOURCE_RESPONSE)
    await flush()
    fireLoad()
    // The provider's own 'load' listener outlives every trip; everything else is the route's.
    const providerOnly = { load: 1 }
    await flush()
    const mounted = listenerCounts()
    expect(Object.keys(mounted).length).toBeGreaterThan(1)

    // 3D on, its fog step deferred to 'idle' (the style "not done loading" once).
    gl.atmosphere.fogThrows = 1
    act(() => { screen.getByRole('button', { name: '3D view' }).click() })
    expect(gl.atmosphere.terrain?.source).toBeTruthy()
    // The sheet's first measurement re-fits; the next, mid-flight, defers its padding ease to 'moveend'.
    act(() => { setSheetObstruction(300) })
    gl.mapInstance.isMoving.mockReturnValue(true)
    act(() => { setSheetObstruction(320) })
    gl.mapInstance.isMoving.mockReturnValue(false)
    expect(listenerCounts()).toEqual({ ...mounted, idle: 1, moveend: (mounted.moveend ?? 0) + 1 })

    back()
    await flush()
    expect(listenerCounts()).toEqual(providerOnly)
    expect(gl.atmosphere.terrain).toBeNull()
    expect(gl.mapInstance.setTerrain).toHaveBeenLastCalledWith(null)
    expect([...gl.layers]).toEqual([])
    expect([...gl.sources]).toEqual([])

    show(OTHER_TRIP_RESPONSE)
    await flush()
    expect(screen.getByRole('heading', { name: 'Another trip' })).toBeInTheDocument()
    expect(gl.atmosphere.terrain).toBeNull()
    expect(gl.MapCtor).toHaveBeenCalledTimes(1)
  })

  it('reports the back button\'s rect for the camera padding, and clears it on unmount', async () => {
    const rect = { left: 12, top: 12, width: 120, height: 48, right: 132, bottom: 60, x: 12, y: 12 }
    const zero = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { ...(this.getAttribute('aria-label') === 'Back to all trips' ? rect : zero), toJSON: () => ({}) }
    })
    const view = await open()
    expect(getControlRects()).toContainEqual({ x: 12, y: 12, w: 120, h: 48 })
    view.unmount()
    expect(getControlRects()).toEqual([])
  })
})
