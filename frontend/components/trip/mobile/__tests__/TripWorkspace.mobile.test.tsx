import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'

/* The desktop/mobile branch in TripWorkspace (plan Phase 2, amendments 2, 4, 5, 7).
   TripMap is stubbed so a test can drive a real pin tap and count mounts: the map driver and the
   agent tools must stay mounted OUTSIDE the branch, so crossing the md line swaps the panel tree
   and nothing else. */

const h = vi.hoisted(() => ({
  mapMounts: 0,
  mapProps: null as null | { onSelectPlace: (id: string) => void; layerMode?: string; focusNonce?: number },
  mobile: false,
  listeners: new Set<() => void>(),
  registered: [] as string[],
  aborted: [] as string[],
}))

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', async () => {
  const { useEffect } = await import('react')
  return {
    default: (props: { onSelectPlace: (id: string) => void }) => {
      h.mapProps = props
      useEffect(() => { h.mapMounts++ }, [])
      return <div data-testid="trip-map" />
    },
  }
})
vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(), Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app/trip/demo' }))
vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

function setMobile(next: boolean) {
  h.mobile = next
  act(() => { h.listeners.forEach((l) => l()) })
}

function renderSeeded(bundle: TripBundle = TOKYO_TRIP, strict = false) {
  const ui = (
    <MapProvider>
      <TripWorkspace tripId={bundle.trip.id} bundle={bundle} readOnly />
    </MapProvider>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

const sheet = () => screen.queryByTestId('mobile-trip-sheet')
const desktopRail = () => document.getElementById('trip-details-panel')

beforeEach(() => {
  h.mapMounts = 0
  h.mapProps = null
  h.mobile = true
  h.listeners.clear()
  h.registered.length = 0
  h.aborted.length = 0
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.test'
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return h.mobile },
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.listeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { h.listeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: (tool: { name: string }, opts?: { signal?: AbortSignal }) => {
        h.registered.push(tool.name)
        opts?.signal?.addEventListener('abort', () => h.aborted.push(tool.name))
      },
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'modelContext')
  delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
})

describe('TripWorkspace — the phone branch', () => {
  it('renders the phone view, and never the desktop rail, below md', async () => {
    renderSeeded()
    expect(sheet()).toBeInTheDocument()
    expect(desktopRail()).toBeNull()
    expect(await screen.findByTestId('trip-map')).toBeInTheDocument()
  })

  it('renders the desktop rail, and never the phone view, at md and up', () => {
    h.mobile = false
    renderSeeded()
    expect(desktopRail()).toBeInTheDocument()
    expect(sheet()).toBeNull()
  })

  it('shows the day chips and at least two stops with evidence on first paint', () => {
    renderSeeded()
    expect(screen.getByRole('button', { name: /Day 1/ })).toBeInTheDocument()
    const rows = document.querySelectorAll('[data-testid="mobile-trip-sheet"] [data-place-id]')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(within(rows[0] as HTMLElement).getByText(/HARRY POTTER/)).toBeInTheDocument()
  })

  it('swaps only the panel tree across 767↔768 — the map driver and the tools stay mounted', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const mounts = h.mapMounts
    const registeredBefore = h.registered.length
    setMobile(false)
    expect(desktopRail()).toBeInTheDocument()
    expect(sheet()).toBeNull()
    setMobile(true)
    expect(sheet()).toBeInTheDocument()
    expect(h.mapMounts).toBe(mounts)
    expect(h.registered.length).toBe(registeredBefore)   // no registration churn
    expect(h.aborted).toEqual([])
  })

  it('keeps tool registration stable across sheet toggles', () => {
    renderSeeded()
    const before = h.registered.length
    expect(before).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /expand trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /collapse trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide trip sheet/i }))
    fireEvent.click(screen.getByRole('button', { name: /show trip sheet/i }))
    expect(h.registered.length).toBe(before)
    expect(h.aborted).toEqual([])
  })

  it('keeps the sheet compact when a pin is tapped on a phone, and opens it if hidden', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    fireEvent.click(screen.getByRole('button', { name: /hide trip sheet/i }))
    expect(sheet()).toHaveAttribute('inert')
    const lastDay = TOKYO_TRIP.days[TOKYO_TRIP.days.length - 1].day_number
    const other = placesForDay(TOKYO_TRIP, lastDay)[0]
    await act(async () => { h.mapProps!.onSelectPlace(other.place_id) })
    expect(sheet()).not.toHaveAttribute('inert')
    expect(sheet()!.className).toContain('h-[45dvh]')
    expect(document.querySelector(`[data-place-id="${other.place_id}"]`)).toHaveAttribute('aria-expanded', 'true')
  })

  it('re-frames the map when the selected row is tapped again', async () => {
    renderSeeded()
    await screen.findByTestId('trip-map')
    const first = placesForDay(TOKYO_TRIP, 1)[0]
    const row = () => document.querySelector<HTMLElement>(`[data-place-id="${first.place_id}"]`)!
    fireEvent.click(row())
    const nonce = h.mapProps!.focusNonce ?? 0
    fireEvent.click(row())
    expect(h.mapProps!.focusNonce).toBe(nonce + 1)
  })

  it('offers no Stay chip or layer toggle when the trip has no hotels', () => {
    renderSeeded()
    expect(screen.queryByRole('button', { name: 'Stay' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Map layer' })).toBeNull()
  })

  it('Stay swaps the list to hotels (unresolved ones included) and a day chip returns to the route', async () => {
    renderSeeded(TOKYO_TRIP_WITH_HOTELS)
    await screen.findByTestId('trip-map')
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(h.mapProps!.layerMode).toBe('hub')
    for (const hotel of TOKYO_TRIP_WITH_HOTELS.hotels) {
      expect(screen.getAllByText(hotel.name).length).toBeGreaterThan(0)
    }
    expect(document.querySelector('[data-testid="mobile-trip-sheet"] [data-place-id]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Day 1/ }))
    expect(h.mapProps!.layerMode).toBe('route')
    expect(document.querySelector('[data-testid="mobile-trip-sheet"] [data-place-id]')).not.toBeNull()
  })

  it('renders under Strict Mode without a second map driver', async () => {
    renderSeeded(TOKYO_TRIP, true)
    await screen.findByTestId('trip-map')
    expect(screen.getAllByTestId('trip-map')).toHaveLength(1)
    expect(sheet()).toBeInTheDocument()
  })
})
