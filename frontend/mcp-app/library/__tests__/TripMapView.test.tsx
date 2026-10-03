import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import MapProvider from '@/components/map/MapProvider'
import { forceTripLayout } from '@/lib/trip/use-trip-layout'
import { setSheetObstruction } from '@/lib/trip/sheet-obstruction'
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
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const mapInstance = {
    on: vi.fn(), off: vi.fn(), getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: 390, clientHeight: 844 })),
    addSource: vi.fn((id: string) => { sources.add(id) }),
    addLayer: vi.fn((layer: { id: string }) => { layers.add(layer.id) }),
    getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    setFilter: vi.fn(), setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(),
    flyTo: vi.fn(), fitBounds: vi.fn(), jumpTo: vi.fn(), setConfigProperty: vi.fn(),
    easeTo: vi.fn(), isMoving: vi.fn(() => false), once: vi.fn(), setPadding: vi.fn(),
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
  return { layers, sources, mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markers }
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
  forceTripLayout('mobile')
  // TripMap frames in a requestAnimationFrame; run it synchronously (as TripMap.test does).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  forceTripLayout(null)
  vi.unstubAllGlobals()
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
    expect(back.className).toContain('h-12')
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
})
