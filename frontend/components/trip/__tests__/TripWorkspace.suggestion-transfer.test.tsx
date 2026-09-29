import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import type { TripBundle } from '@/lib/trip/backend-types'

/* A12 (Codex re-check #6 PARTIAL and a new Medium), end to end: the real TripWorkspace and TripMap
   over a mocked Mapbox, the layout switched by matchMedia. Nothing hands the open-card descriptor
   in by hand: the phone's own paths must report it. */

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
  type P = { cls: string; removed: boolean; el: HTMLElement; closes: (() => void)[] }
  const popups: P[] = []
  const Popup = vi.fn((o: { className?: string }) => {
    const rec: P = { cls: String(o.className ?? ''), removed: false, el: document.createElement('div'), closes: [] }
    popups.push(rec)
    const p = {
      setLngLat: vi.fn(() => p),
      setDOMContent: vi.fn((n: HTMLElement) => { rec.el.append(n); return p }),
      addTo: vi.fn(() => { document.body.append(rec.el); return p }),
      remove: vi.fn(() => { rec.removed = true; rec.el.remove(); return p }),
      on: vi.fn((ev: string, fn: () => void) => { if (ev === 'close') rec.closes.push(fn) }),
    }
    return p
  })
  const Marker = vi.fn(() => { const m = { setLngLat: vi.fn(() => m), addTo: vi.fn(() => m), remove: vi.fn() }; return m })
  return { map, listeners, popups, Popup, Marker, mobile: true, mq: new Set<() => void>() }
})

vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(() => h.map), Marker: h.Marker, Popup: h.Popup, LngLatBounds: vi.fn(() => ({ extend: vi.fn() })), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('@/lib/trip/safe-area', () => ({ readSafeAreaTop: () => 0 }))
vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/app/trip/demo' }))
vi.mock('@/components/webmcp/TripTools', () => ({ default: () => null }))

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

async function flush(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
function setMobile(next: boolean) { h.mobile = next; act(() => { h.mq.forEach((l) => l()) }) }
const phoneCards = () => h.popups.filter((p) => !p.removed && p.cls.includes('phone-popup'))
const placeCards = () => h.popups.filter((p) => !p.removed && p.cls.includes('place-card'))

async function mount(bundle: TripBundle) {
  render(<MapProvider><TripWorkspace tripId={bundle.trip.id} bundle={bundle} readOnly /></MapProvider>)
  for (let i = 0; i < 50 && !h.listeners.get('load'); i++) await flush()
  act(() => { h.listeners.get('load')?.forEach((fn) => fn()) })
  for (let i = 0; i < 50 && h.Marker.mock.calls.length === 0; i++) await flush()
}
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }

beforeEach(() => {
  vi.clearAllMocks()
  h.listeners.clear()
  h.popups.length = 0
  h.mobile = true
  h.mq.clear()
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
    get matches() { return q.includes('max-width') ? h.mobile : false },
    media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.mq.add(l) }, removeEventListener: (_: string, l: () => void) => { h.mq.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren() })

describe('phone → desktop with a suggestion open (Codex re-check)', () => {
  // #6 PARTIAL: a hotel chosen in the phone Stay list, then widening: its place card replaces the
  // phone DOM card instead of the detail vanishing.
  it('a hotel picked in the phone Stay list becomes the desktop place card on widening', async () => {
    await mount(TOKYO_TRIP_WITH_HOTELS)
    await click(screen.getByRole('button', { name: 'Stay' }))
    await click(document.querySelector('[data-trip-scroll] [data-hotel-id="hotel_1"]'))
    expect(phoneCards()).toHaveLength(1)
    setMobile(false)
    await flush(50)
    expect(phoneCards()).toHaveLength(0)
    expect(placeCards()).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(TOKYO_TRIP_WITH_HOTELS.hotels[0].name)
  })

  // New Medium: on a phone, a restaurant's DOM card, then a stop row, then that old DOM card's
  // close, then widening: the stop's card is the one that survives.
  it('a stop chosen after a restaurant survives the old DOM card\'s close and the widening', async () => {
    await mount(TOKYO_TRIP)
    await click(document.querySelector('[data-trip-scroll] [data-place-id="pl_sandolab"]'))
    await click(document.querySelector('[data-trip-scroll] [data-eat-place-id="pl_popo"]'))
    expect(phoneCards()).toHaveLength(1)
    const eatPopup = phoneCards()[0]
    await click(document.querySelector('[data-trip-scroll] [data-place-id="pl_akasaka"]'))
    expect(phoneCards()).toHaveLength(0)                      // the stop replaced the DOM card
    act(() => { eatPopup.closes.forEach((fn) => fn()) })      // a late close of that old card
    await flush()
    setMobile(false)
    await flush(50)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Akasaka Station')
  })
})
