import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'

/* Codex final #8: select a stop, pan away, then show_on_map that SAME stop. The tool replies
   "Flying to stop …", so the real TripMap must issue a real flyTo again, not only reopen the card.
   The real TripWorkspace and TripMap run here over a mocked Mapbox; show_on_map is the real tool. */

const h = vi.hoisted(() => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const listeners = new Map<string, Set<(e?: unknown) => void>>()
  const map = {
    on: vi.fn((ev: string, fn: (e?: unknown) => void) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev)!.add(fn) }),
    off: vi.fn(), once: vi.fn(), getZoom: vi.fn(() => 13),
    getCanvas: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900 })),
    getContainer: vi.fn(() => ({ clientWidth: 1440, clientHeight: 900, getBoundingClientRect: () => ({ left: 0, top: 0 }), style: { setProperty: vi.fn(), removeProperty: vi.fn() } })),
    project: vi.fn(() => ({ x: 900, y: 270 })), getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
    addSource: vi.fn(), addLayer: vi.fn(), getSource: vi.fn(() => undefined), getLayer: vi.fn(() => undefined),
    removeLayer: vi.fn(), removeSource: vi.fn(), flyTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(), panBy: vi.fn(),
    isMoving: vi.fn(() => false), setPadding: vi.fn(), setConfigProperty: vi.fn(), remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  const Popup = vi.fn(() => {
    const p = { setLngLat: vi.fn(() => p), setDOMContent: vi.fn(() => p), addTo: vi.fn(() => p), remove: vi.fn(), on: vi.fn() }
    return p
  })
  const Marker = vi.fn(() => { const m = { setLngLat: vi.fn(() => m), addTo: vi.fn(() => m), remove: vi.fn() }; return m })
  return { map, listeners, Popup, Marker, tools: { current: null as null | Record<string, unknown> } }
})

vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(() => h.map), Marker: h.Marker, Popup: h.Popup, LngLatBounds: vi.fn(() => ({ extend: vi.fn() })), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('@/lib/trip/safe-area', () => ({ readSafeAreaTop: () => 0 }))
vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/trip/demo',
}))
vi.mock('@/components/webmcp/TripTools', () => ({ default: (p: Record<string, unknown>) => { h.tools.current = p; return null } }))

import { showOnMapTool, type MapDeps } from '@/lib/webmcp/tools/map'
import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

async function flush(ms = 30) { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }

beforeEach(() => {
  vi.clearAllMocks()
  h.listeners.clear()
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN })

describe('show_on_map on the stop that is already selected', () => {
  it('flies to it again (a real flyTo), after the user panned away', async () => {
    render(<MapProvider><TripWorkspace tripId={TOKYO_TRIP.trip.id} bundle={TOKYO_TRIP} readOnly /></MapProvider>)
    // next/dynamic loads the real TripMap asynchronously: wait for its acquire, then load the map.
    for (let i = 0; i < 50 && !h.listeners.get('load'); i++) await flush(20)
    act(() => { h.listeners.get('load')?.forEach((fn) => fn()) })
    for (let i = 0; i < 50 && h.Marker.mock.calls.length === 0; i++) await flush(20)
    // Read through at call time, as the real TripTools does (actionsRef): never a stale render's setter.
    const live = () => h.tools.current as unknown as Omit<MapDeps, 'bundle' | 'view'>
    const tool = showOnMapTool({
      bundle: () => TOKYO_TRIP, view: () => null,
      showDay: (d) => live().showDay(d), selectPlace: (id) => live().selectPlace(id),
      setLayerMode: (m) => live().setLayerMode(m), openPanel: () => live().openPanel(), showList: (l) => live().showList?.(l),
    })
    const sando = TOKYO_TRIP.places.find((p) => p.place_id === 'pl_sandolab')!.place
    const fliesToSando = () => h.map.flyTo.mock.calls.filter((c) => {
      const center = (c[0] as { center?: [number, number] }).center
      return center && center[0] === sando.lng && center[1] === sando.lat
    }).length
    await act(async () => { await tool.execute({ target: 'place', place: '3' }) })
    await flush()
    const first = fliesToSando()
    expect(first).toBeGreaterThanOrEqual(1)
    await act(async () => { await tool.execute({ target: 'place', place: '3' }) })   // same stop, again
    await flush()
    expect(fliesToSando()).toBe(first + 1)
  })
})
