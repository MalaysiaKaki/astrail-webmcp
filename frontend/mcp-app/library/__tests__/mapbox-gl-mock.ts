/**
 * A minimal mapbox-gl for the library wiring tests: one map instance whose listeners can be fired.
 * Use: `vi.mock('mapbox-gl', async () => (await import('./mapbox-gl-mock')).mapboxModule)`.
 * TripMapView.test.tsx keeps its own richer mock (live layer/source/listener registries).
 */
import { vi } from 'vitest'

const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
const add = (event: string, fn: (...args: unknown[]) => void) => {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(fn)
}
const handler = () => ({ enable: vi.fn(), disable: vi.fn() })

export const mapInstance = {
  on: vi.fn(add), once: vi.fn(add),
  off: vi.fn((event: string, fn: (...args: unknown[]) => void) => { listeners.get(event)?.delete(fn) }),
  getTerrain: vi.fn(() => null), setTerrain: vi.fn(), getFog: vi.fn(() => null), setFog: vi.fn(),
  getZoom: vi.fn(() => 13),
  getCanvas: vi.fn(() => ({ clientWidth: 390, clientHeight: 844 })),
  getContainer: vi.fn(() => ({ clientWidth: 390, clientHeight: 844 })),
  addSource: vi.fn(), addLayer: vi.fn(), getSource: vi.fn(), getLayer: vi.fn(),
  removeLayer: vi.fn(), removeSource: vi.fn(),
  setFilter: vi.fn(), setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(),
  flyTo: vi.fn(), fitBounds: vi.fn(), jumpTo: vi.fn(), setConfigProperty: vi.fn(),
  easeTo: vi.fn(), isMoving: vi.fn(() => false), setPadding: vi.fn(),
  remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
  style: { setTransition: vi.fn() },
  scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
  keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
}

export const MapCtor = vi.fn(() => mapInstance)

/** Calls every listener registered for `event` (e.g. 'load', or 'error' before load). */
export function fire(event: string, ...args: unknown[]) {
  for (const fn of [...(listeners.get(event) ?? [])]) fn(...args)
}

export function resetMapbox() {
  listeners.clear()
  vi.clearAllMocks()
}

function chain(extra: Record<string, unknown>) {
  const self: Record<string, unknown> = { ...extra }
  for (const name of ['setLngLat', 'addTo', 'setDOMContent']) self[name] = vi.fn(() => self)
  return self
}

export const mapboxModule = {
  default: {
    Map: MapCtor,
    Marker: vi.fn(() => chain({ remove: vi.fn() })),
    Popup: vi.fn(() => chain({ remove: vi.fn(), on: vi.fn(), getElement: vi.fn(() => null) })),
    LngLatBounds: vi.fn(() => ({ extend: vi.fn() })),
    accessToken: '',
  },
}
