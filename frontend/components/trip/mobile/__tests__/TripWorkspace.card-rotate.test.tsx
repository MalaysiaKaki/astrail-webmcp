import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'

/* A10 item 6 (Codex review §4): crossing the breakpoint while the desktop place card holds focus
   keeps the SELECTION and moves focus to the surviving surface (the phone sheet's card for that
   stop), never to <body>. Back on desktop the card is shown again. */

const h = vi.hoisted(() => ({
  mobile: false,
  listeners: new Set<() => void>(),
  mapProps: null as null | { onSelectPlace: (id: string) => void; card?: { node: ReactNode } | null },
}))

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', () => ({
  default: (p: NonNullable<typeof h.mapProps>) => { h.mapProps = p; return <div data-testid="trip-map">{p.card?.node}</div> },
}))
vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(), Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app/trip/x', useSearchParams: () => new URLSearchParams() }))

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

function setMobile(next: boolean) {
  h.mobile = next
  act(() => { h.listeners.forEach((l) => l()) })
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) }

beforeEach(() => {
  h.mobile = false
  h.listeners.clear()
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  Element.prototype.scrollIntoView = vi.fn()
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return query.includes('max-width') ? h.mobile : false },
    media: query, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.listeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { h.listeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { vi.restoreAllMocks(); delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN })

describe('the place card across the phone breakpoint', () => {
  it('moves focus from the desktop card to the phone\'s card for the same stop, and back to a card', async () => {
    render(<MapProvider><TripWorkspace tripId={TOKYO_TRIP.trip.id} bundle={TOKYO_TRIP} readOnly /></MapProvider>)
    await flush()
    await act(async () => { h.mapProps!.onSelectPlace('pl_sandolab') })
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    setMobile(true)
    await flush()
    expect(screen.queryByRole('dialog')).toBeNull()
    const phoneCard = document.querySelector('[data-trip-scroll] [data-place-id="pl_sandolab"]')
    expect(phoneCard).toHaveAttribute('aria-expanded', 'true')
    expect(document.activeElement).toBe(phoneCard)
    setMobile(false)
    await flush()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('SANDO LAB TOKYO')
  })
})
