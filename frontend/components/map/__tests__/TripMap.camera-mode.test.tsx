import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { clearControlRects, setControlRects } from '@/lib/trip/control-obstruction'
import { DEM_SOURCE_ID, PITCH_3D } from '@/components/map/camera-mode'
import MapProvider from '@/components/map/MapProvider'
import TripMap from '@/components/map/TripMap'

/* Plan A5 amendment 1: 3D is a camera MODE. With it off, every trip camera command flies flat and
   the map carries no terrain; with it on, every command is tilted and terrain is present. Amendment
   2: terrain lives on a SHARED map, so it is cleared (terrain before source) when the route leaves. */

const { mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markerElements, popupElements, state } = vi.hoisted(() => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const state = {
    sources: new Set<string>(),
    terrain: null as null | { source: string },
    fog: { color: 'standard' } as object | null,
    config: {} as Record<string, unknown>,
    log: [] as string[],
  }
  const mapInstance = {
    on: vi.fn(), off: vi.fn(), getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900 })),
    addSource: vi.fn((id: string) => {
      if (state.sources.has(id)) throw new Error(`There is already a source with ID "${id}".`)
      state.sources.add(id); state.log.push(`add:${id}`)
    }),
    addLayer: vi.fn(),
    getSource: vi.fn((id: string) => (state.sources.has(id) ? {} : undefined)),
    getLayer: vi.fn((_id?: string) => undefined),
    removeLayer: vi.fn(),
    removeSource: vi.fn((id: string) => {
      if (state.terrain?.source === id) throw new Error('terrain still uses it')
      state.sources.delete(id); state.log.push(`remove:${id}`)
    }),
    setTerrain: vi.fn((t: { source: string } | null) => { state.terrain = t; state.log.push(t ? 'terrain:on' : 'terrain:off') }),
    getTerrain: vi.fn(() => state.terrain),
    setFog: vi.fn((f: object | null) => { state.fog = f }),
    getFog: vi.fn(() => state.fog),
    getConfigProperty: vi.fn((_i: string, k: string) => state.config[k]),
    flyTo: vi.fn(), fitBounds: vi.fn(), setConfigProperty: vi.fn(), jumpTo: vi.fn(),
    easeTo: vi.fn(), isMoving: vi.fn(() => false), once: vi.fn(), setPadding: vi.fn(),
    getContainer: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900, getBoundingClientRect: () => ({ left: 0, top: 0 }) })),
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
  const popupElements: HTMLElement[] = []
  const PopupCtor = vi.fn(() => {
    const popup = {
      setLngLat: vi.fn(() => popup),
      setDOMContent: vi.fn((el: HTMLElement) => { popupElements.push(el); return popup }),
      addTo: vi.fn(() => popup), remove: vi.fn(),
    }
    return popup
  })
  const BoundsCtor = vi.fn(() => ({ extend: vi.fn() }))
  return { mapInstance, MapCtor, MarkerCtor, PopupCtor, BoundsCtor, markerElements, popupElements, state }
})

vi.mock('mapbox-gl', () => ({
  default: { Map: MapCtor, Marker: MarkerCtor, Popup: PopupCtor, LngLatBounds: BoundsCtor, accessToken: '' },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('@/lib/trip/safe-area', () => ({ readSafeAreaTop: () => 0 }))

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
function fireLoad() {
  const load = mapInstance.on.mock.calls.find((c) => c[0] === 'load')
  act(() => { (load?.[1] as () => void)?.() })
}

type Props = Partial<Parameters<typeof TripMap>[0]>
const base: Parameters<typeof TripMap>[0] = {
  bundle: TOKYO_TRIP, activeDayNumber: 1, selectedPlaceId: null, onSelectPlace: () => {},
}
const tree = (p: Props) => <MapProvider><TripMap {...base} {...p} /></MapProvider>

async function mount(p: Props = {}) {
  const view = render(tree(p))
  await flush(); fireLoad(); await flush()
  return { ...view, set: async (next: Props) => { view.rerender(tree({ ...p, ...next })); await flush(); p = { ...p, ...next } } }
}

const lastPitch = () => {
  const calls = [...mapInstance.flyTo.mock.calls, ...mapInstance.fitBounds.mock.calls.map((c) => [c[1]])]
  // The most recent camera command, whichever API it used.
  const fly = mapInstance.flyTo.mock.invocationCallOrder.at(-1) ?? -1
  const fit = mapInstance.fitBounds.mock.invocationCallOrder.at(-1) ?? -1
  expect(calls.length).toBeGreaterThan(0)
  return fly > fit ? mapInstance.flyTo.mock.calls.at(-1)![0].pitch : mapInstance.fitBounds.mock.calls.at(-1)![1].pitch
}

describe('TripMap 3D camera mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    markerElements.length = 0
    popupElements.length = 0
    state.sources.clear(); state.terrain = null; state.fog = { color: 'standard' }; state.config = {}; state.log = []
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
    vi.unstubAllGlobals()
    clearControlRects('test')
  })

  it('off by default: the initial fit is flat and no DEM source is ever added', async () => {
    await mount()
    expect(mapInstance.fitBounds.mock.calls.at(-1)![1].pitch).toBe(0)
    expect(mapInstance.addSource.mock.calls.map((c) => c[0])).not.toContain(DEM_SOURCE_ID)
    expect(mapInstance.setTerrain).not.toHaveBeenCalled()
    expect(mapInstance.setFog).not.toHaveBeenCalled()
  })

  it('turning 3D on adds terrain + fog and eases the pitch up; off removes terrain before the source and restores fog', async () => {
    const view = await mount()
    await view.set({ mode3d: true })
    expect(state.terrain).toEqual(expect.objectContaining({ source: DEM_SOURCE_ID }))
    expect(state.fog).not.toEqual({ color: 'standard' })
    expect(mapInstance.easeTo.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pitch: PITCH_3D }))
    state.log.length = 0
    await view.set({ mode3d: false })
    expect(state.log).toEqual(['terrain:off', `remove:${DEM_SOURCE_ID}`])
    expect(state.fog).toEqual({ color: 'standard' })
    expect(mapInstance.easeTo.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pitch: 0 }))
  })

  it('reduced motion switches the pitch with jumpTo instead of an ease', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {},
    }))
    const view = await mount()
    mapInstance.easeTo.mockClear()
    await view.set({ mode3d: true })
    expect(mapInstance.jumpTo).toHaveBeenCalledWith({ pitch: PITCH_3D })
    expect(mapInstance.easeTo.mock.calls.some((c) => 'pitch' in c[0])).toBe(false)
  })

  for (const mode3d of [false, true]) {
    const want = mode3d ? PITCH_3D : 0
    describe(`with 3D ${mode3d ? 'on' : 'off'}, every camera command flies at pitch ${want}`, () => {
      it('day switch', async () => {
        const view = await mount({ mode3d })
        await view.set({ activeDayNumber: 2 })
        expect(lastPitch()).toBe(want)
        expect(Boolean(state.terrain)).toBe(mode3d)
      })
      it('Fit (day and hotel hub)', async () => {
        const view = await mount({ mode3d, fitNonce: 0 })
        await view.set({ fitNonce: 1 })
        expect(lastPitch()).toBe(want)
        const hub = TOKYO_TRIP_WITH_HOTELS.hotels.find((h) => h.is_recommended)!
        const hubView = await mount({ mode3d, bundle: TOKYO_TRIP_WITH_HOTELS, layerMode: 'hub', selectedHotelId: hub.id, fitNonce: 0 })
        await hubView.set({ fitNonce: 1 })
        expect(lastPitch()).toBe(want)
      })
      it('stop selection (also what a WebMCP select_place / show_on_map drives)', async () => {
        const view = await mount({ mode3d })
        await view.set({ selectedPlaceId: TOKYO_TRIP.places[0].place_id })
        expect(lastPitch()).toBe(want)
      })
      it('restaurant selection', async () => {
        const bundle = {
          ...TOKYO_TRIP,
          suggestion_places: [{ id: 'pl_eat', name: 'Eat', place_type: 'restaurant', lat: 35.67, lng: 139.7 }],
        } as never
        const view = await mount({ mode3d, bundle })
        await view.set({ selectedRestaurantPlaceId: 'pl_eat' })
        expect(lastPitch()).toBe(want)
      })
      it('hotel hub selection', async () => {
        const hub = TOKYO_TRIP_WITH_HOTELS.hotels.find((h) => h.is_recommended)!
        const view = await mount({ mode3d, bundle: TOKYO_TRIP_WITH_HOTELS })
        await view.set({ layerMode: 'hub', selectedHotelId: hub.id })
        expect(lastPitch()).toBe(want)
      })
    })
  }

  it('the popup\'s "Zoom in for 3D" turns the mode on, then flies to the stop tilted', async () => {
    const onRequest3d = vi.fn()
    const view = await mount({ onRequest3d })
    const pin = markerElements.find((e) => e.classList.contains('constellation-pin') && !e.classList.contains('constellation-pin--receding'))!
    act(() => { pin.click() })
    const zoom = popupElements.at(-1)!.querySelector<HTMLButtonElement>('.evidence-popup__zoom')!
    mapInstance.flyTo.mockClear()
    act(() => { zoom.click() })
    expect(onRequest3d).toHaveBeenCalledTimes(1)
    expect(mapInstance.flyTo).not.toHaveBeenCalled()          // waits for the mode, not a one-off tilt
    await view.set({ mode3d: true })
    expect(mapInstance.flyTo.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ zoom: 17, pitch: PITCH_3D }))
    expect(state.terrain).not.toBeNull()
  })

  it('leaving the route with 3D on clears terrain before the source and restores the fog (shared map)', async () => {
    const shell = (child: React.ReactNode) => <MapProvider>{child}</MapProvider>
    const view = render(shell(<TripMap {...base} mode3d />))
    await flush(); fireLoad(); await flush()
    expect(state.terrain).not.toBeNull()
    state.log.length = 0
    view.rerender(shell(null))
    await flush()
    expect(state.log.filter((l) => l.startsWith('terrain') || l.includes(DEM_SOURCE_ID)))
      .toEqual(['terrain:off', `remove:${DEM_SOURCE_ID}`])
    expect(state.fog).toEqual({ color: 'standard' })
  })

  /* Found live: leaving the whole /app shell removes the map first, and a controller that still
     held it threw "Cannot read properties of undefined (reading 'getOwnSource')". */
  it('leaving the whole shell (map removed) never touches the removed map', async () => {
    const view = await mount({ mode3d: true })
    state.log.length = 0
    mapInstance.getSource.mockClear(); mapInstance.removeSource.mockClear()
    expect(() => view.unmount()).not.toThrow()
    expect(mapInstance.remove).toHaveBeenCalled()
    expect(mapInstance.removeSource).not.toHaveBeenCalledWith(DEM_SOURCE_ID)
  })

  it('3D trip → /app/trips → another trip on the SAME shared map: no duplicate source, no leftover terrain', async () => {
    const shell = (child: React.ReactNode) => <MapProvider>{child}</MapProvider>
    const view = render(shell(<TripMap key="a" {...base} mode3d />))
    await flush(); fireLoad(); await flush()
    expect(state.terrain).not.toBeNull()
    view.rerender(shell(<div>trips dashboard</div>))                 // the trip route left
    await flush()
    expect(state.terrain).toBeNull()
    expect(state.sources.has(DEM_SOURCE_ID)).toBe(false)
    expect(state.fog).toEqual({ color: 'standard' })
    view.rerender(shell(<TripMap key="b" {...base} mode3d />))       // another 3D trip
    await flush()
    expect(state.terrain).toEqual(expect.objectContaining({ source: DEM_SOURCE_ID }))
    view.rerender(shell(<TripMap key="c" {...base} />))              // and a flat one
    await flush()
    expect(state.terrain).toBeNull()
    expect(state.sources.has(DEM_SOURCE_ID)).toBe(false)
  })

  it('prefers the Standard style\'s native 3D buildings over the custom extrusion layer', async () => {
    state.config = { show3dObjects: true }
    await mount()
    expect(mapInstance.addLayer.mock.calls.map((c) => c[0].id)).not.toContain('astrail-3d-buildings')
  })

  it('pads the camera around the measured controls', async () => {
    mapInstance.getCanvas.mockReturnValue({ clientWidth: 1440, clientHeight: 900 })
    // A control sitting right in the middle of the desktop framing area.
    act(() => { setControlRects('test', [{ x: 900, y: 420, w: 44, h: 44 }]) })
    await mount()
    const pad = mapInstance.fitBounds.mock.calls.at(-1)![1].padding
    const framedRight = 1440 - pad.right, framedBottom = 900 - pad.bottom
    const clearOf = 900 + 44 <= pad.left || 900 >= framedRight || 420 + 44 <= pad.top || 420 >= framedBottom
    expect(clearOf).toBe(true)
  })
})
