/* The /app/trips map pane's control stack (C5): the frozen MapControlStack (desktop variant) with
   zoom, 3D (the shared camera mode) and Fit. 3D is a mode here too — every dashboard camera move
   takes its pitch from it, and the terrain it adds to the SHARED map is removed on unmount. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DEM_SOURCE_ID, PITCH_3D } from '@/components/map/camera-mode'

const { mapInstance, MarkerCtor, BoundsCtor } = vi.hoisted(() => {
  const sources = new Set<string>()
  let terrain: { source: string } | null = null
  const mapInstance = {
    on: vi.fn(), off: vi.fn(), once: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 100, lat: 20 })),
    setCenter: vi.fn(),
    flyTo: vi.fn(), fitBounds: vi.fn(), easeTo: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(),
    getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
    addSource: vi.fn((id: string) => { sources.add(id) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    setTerrain: vi.fn((t: { source: string } | null) => { terrain = t }),
    getTerrain: vi.fn(() => terrain),
    getFog: vi.fn(() => null), setFog: vi.fn(),
    reset: () => { sources.clear(); terrain = null },
  }
  const MarkerCtor = vi.fn(() => {
    const marker = { setLngLat: vi.fn(() => marker), addTo: vi.fn(() => marker), remove: vi.fn() }
    return marker
  })
  const BoundsCtor = vi.fn(() => ({ extend: vi.fn() }))
  return { mapInstance, MarkerCtor, BoundsCtor }
})
vi.mock('mapbox-gl', () => ({ default: { Marker: MarkerCtor, LngLatBounds: BoundsCtor } }))

const shared = vi.hoisted(() => ({
  hasToken: true, ready: true,
  getMap: vi.fn(), acquire: vi.fn(), release: vi.fn(), setMarkers: vi.fn(), setLightPreset: vi.fn(),
}))
vi.mock('@/components/map/MapProvider', () => ({ useSharedMap: () => shared }))

const { getTrip } = vi.hoisted(() => ({ getTrip: vi.fn() }))
vi.mock('@/lib/trip/supabase-api', () => ({ getTrip }))
vi.mock('@/lib/trip/map-handoff', () => ({ markTripFramed: vi.fn() }))

import TripMapDashboard from '@/components/trips/TripMapDashboard'

const windowRef = {
  current: { getBoundingClientRect: () => ({ top: 0, bottom: 900, left: 636, right: 1440 }) },
} as unknown as React.RefObject<HTMLElement | null>

const TWO_PLACES = {
  places: [
    { place_id: 'a', place: { lng: 139.70, lat: 35.66 } },
    { place_id: 'b', place: { lng: 135.50, lat: 34.69 } },
  ],
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mapInstance.reset()
  shared.hasToken = true
  shared.ready = true
  shared.getMap.mockReturnValue(mapInstance)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  reducedMotion(false)
})
afterEach(() => vi.unstubAllGlobals())

const button = (name: RegExp | string) => screen.getByRole('button', { name })

describe('TripMapDashboard control stack', () => {
  it('renders the desktop stack: zoom in, zoom out, 3D (off) and a whole-globe Fit while idle', () => {
    render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    expect(screen.getByTestId('map-control-stack-desktop')).toBeInTheDocument()
    expect(button('Zoom in')).toBeInTheDocument()
    expect(button('Zoom out')).toBeInTheDocument()
    expect(button('3D view')).toHaveAttribute('aria-pressed', 'false')
    expect(button('Show the whole globe')).toBeInTheDocument()
  })

  it('zooms the shared map, instantly under reduced motion', () => {
    const { unmount } = render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    fireEvent.click(button('Zoom in'))
    expect(mapInstance.zoomIn).toHaveBeenCalledWith({ duration: 300 })
    fireEvent.click(button('Zoom out'))
    expect(mapInstance.zoomOut).toHaveBeenCalledWith({ duration: 300 })
    unmount()
    reducedMotion(true)
    render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    fireEvent.click(button('Zoom in'))
    expect(mapInstance.zoomIn).toHaveBeenLastCalledWith({ duration: 0 })
  })

  it('3D on adds our terrain and tilts the camera; off flattens it and removes the source', () => {
    render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    fireEvent.click(button('3D view'))
    expect(button('3D view')).toHaveAttribute('aria-pressed', 'true')
    expect(mapInstance.addSource).toHaveBeenCalledWith(DEM_SOURCE_ID, expect.anything())
    expect(mapInstance.setTerrain).toHaveBeenLastCalledWith(expect.objectContaining({ source: DEM_SOURCE_ID }))
    expect(mapInstance.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: PITCH_3D }))

    fireEvent.click(button('3D view'))
    expect(mapInstance.setTerrain).toHaveBeenLastCalledWith(null)
    expect(mapInstance.removeSource).toHaveBeenCalledWith(DEM_SOURCE_ID)
    expect(mapInstance.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0 }))
  })

  it('frames a selected trip at the mode pitch: flat by default, 60 with 3D on', async () => {
    getTrip.mockResolvedValue(TWO_PLACES)
    const { rerender } = render(<TripMapDashboard selectedTripId="trip-1" windowRef={windowRef} />)
    await flush()
    expect(mapInstance.fitBounds).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ pitch: 0 }))

    fireEvent.click(button('3D view'))
    rerender(<TripMapDashboard selectedTripId="trip-2" windowRef={windowRef} />)
    await flush()
    expect(mapInstance.fitBounds).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ pitch: PITCH_3D }))
  })

  it('Fit re-frames the selected trip', async () => {
    getTrip.mockResolvedValue(TWO_PLACES)
    render(<TripMapDashboard selectedTripId="trip-1" windowRef={windowRef} />)
    await flush()
    const before = mapInstance.fitBounds.mock.calls.length
    fireEvent.click(button('Fit trip on the map'))
    expect(mapInstance.fitBounds.mock.calls.length).toBe(before + 1)
  })

  it('Fit returns an idle, zoomed-in globe to the whole-globe frame', () => {
    render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    fireEvent.click(button('Zoom in'))
    mapInstance.easeTo.mockClear()
    fireEvent.click(button('Show the whole globe'))
    expect(mapInstance.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 1.4 }))
  })

  it('hides Fit while a selected trip has nothing located', async () => {
    getTrip.mockResolvedValue({ places: [{ place_id: 'x', place: { lng: 0, lat: 0 } }] })
    render(<TripMapDashboard selectedTripId="trip-3" windowRef={windowRef} />)
    await flush()
    expect(screen.queryByRole('button', { name: /fit|whole globe/i })).toBeNull()
    expect(button('Zoom in')).toBeInTheDocument()
  })

  it('leaves the shared map flat on unmount: terrain off before the source goes, then release', () => {
    const { unmount } = render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    fireEvent.click(button('3D view'))
    mapInstance.setTerrain.mockClear()
    unmount()
    expect(mapInstance.setTerrain).toHaveBeenCalledWith(null)
    expect(mapInstance.removeSource).toHaveBeenCalledWith(DEM_SOURCE_ID)
    expect(mapInstance.setTerrain.mock.invocationCallOrder[0]).toBeLessThan(mapInstance.removeSource.mock.invocationCallOrder[0])
    expect(mapInstance.removeSource.mock.invocationCallOrder[0]).toBeLessThan(shared.release.mock.invocationCallOrder[0])
  })

  it('adds no terrain source until 3D is turned on', () => {
    render(<TripMapDashboard selectedTripId={null} windowRef={windowRef} />)
    expect(mapInstance.addSource).not.toHaveBeenCalled()
  })
})
