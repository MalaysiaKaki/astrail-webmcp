import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'

/* Codex #3: rotating across the 768px line swaps the phone tree for the desktop rail, and each
   has its own feedback composer. The REAL TripFeedbackPanel is mounted here (the other phone
   suite stubs it), so a draft, a rating, and an in-flight send are observed surviving the
   switch — or not. */

const h = vi.hoisted(() => ({
  mobile: true,
  listeners: new Set<() => void>(),
  submitTripFeedback: vi.fn(),
  getAccessToken: vi.fn(),
}))

vi.mock('@/lib/trip/supabase-api', () => ({ getTrip: vi.fn() }))
vi.mock('@/components/map/TripMap', () => ({ default: () => <div data-testid="trip-map" /> }))
vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(), Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app/trip/x', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/session', () => ({ getAccessToken: h.getAccessToken }))
vi.mock('@/lib/trip/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trip/api')>()
  return { ...actual, submitTripFeedback: h.submitTripFeedback }
})

import MapProvider from '@/components/map/MapProvider'
import TripWorkspace from '@/components/trip/TripWorkspace'

const COMPLETE: TripBundle = { ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status: 'complete' } }

function setMobile(next: boolean) {
  h.mobile = next
  act(() => { h.listeners.forEach((l) => l()) })
}

const note = () => screen.getByRole('textbox', { name: 'Feedback note' }) as HTMLTextAreaElement
const star = (n: number) => screen.getByRole('radio', { name: `${n} star${n === 1 ? '' : 's'}` })

beforeEach(() => {
  h.mobile = true
  h.listeners.clear()
  h.submitTripFeedback.mockReset()
  h.getAccessToken.mockReset().mockResolvedValue('token')
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return h.mobile },
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.listeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { h.listeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { vi.restoreAllMocks() })

const renderTrip = () => render(
  <MapProvider>
    <TripWorkspace tripId={COMPLETE.trip.id} bundle={COMPLETE} />
  </MapProvider>,
)

describe('TripWorkspace — feedback across a rotation', () => {
  it('keeps the note and the rating when the layout crosses 768px and back', () => {
    renderTrip()
    fireEvent.change(note(), { target: { value: 'Slower mornings please' } })
    fireEvent.click(star(4))

    setMobile(false)
    expect(document.getElementById('trip-details-panel')).not.toBeNull()   // desktop tree now
    expect(note().value).toBe('Slower mornings please')
    expect(star(4)).toHaveAttribute('aria-checked', 'true')

    setMobile(true)
    expect(screen.getByTestId('mobile-trip-sheet')).toBeInTheDocument()
    expect(note().value).toBe('Slower mornings please')
    expect(star(4)).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps a send in flight visible across the switch and lands its result', async () => {
    let resolve!: (v: unknown) => void
    h.submitTripFeedback.mockReturnValue(new Promise((r) => { resolve = r }))
    renderTrip()
    fireEvent.change(note(), { target: { value: 'Great ramen' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /send feedback/i })) })
    expect(screen.getByText('Sending…', { selector: '[role=status]' })).toBeInTheDocument()

    setMobile(false)
    expect(screen.getByText('Sending…', { selector: '[role=status]' })).toBeInTheDocument()          // still visibly pending

    await act(async () => {
      resolve({ feedback: { id: 'fb', trip_id: COMPLETE.trip.id, artifact_type: 'trip', feedback_type: 'free_text', rating: null, comment: 'Great ramen' } })
    })
    expect(screen.getByText('Noted — thanks.', { selector: '[role=status]' })).toBeInTheDocument()
    expect(note().value).toBe('')                                       // cleared after the send
    expect(h.submitTripFeedback).toHaveBeenCalledTimes(1)
  })
})
