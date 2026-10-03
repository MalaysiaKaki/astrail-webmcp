import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MULTI_SOURCE_RESPONSE } from '../../src/__fixtures__/multi-source-bundle'
import { widgetData } from '../../src/__tests__/tool-results'
import { tripDateRange, tripStatusLabel } from '@/lib/trip/trip-presenters'
import { EMPTY_TRIPS_PAGE, MORE_TRIPS_PAGE, TRIPS_PAGE_FIXTURE } from '../__fixtures__/trips-page'
import type { LibraryState } from '../state'
import MapProvider from '@/components/map/MapProvider'
import TripLibrary, { MAP_BACKSTOP_MS } from '../TripLibrary'
import { fire, MapCtor, resetMapbox } from './mapbox-gl-mock'

vi.mock('mapbox-gl', async () => (await import('./mapbox-gl-mock')).mapboxModule)

afterEach(cleanup)

const TRIP_ID = MULTI_SOURCE_RESPONSE.bundle.trip.id
const ready = (page: typeof TRIPS_PAGE_FIXTURE, extra: Partial<LibraryState> = {}): LibraryState => ({
  list: { kind: 'ready' }, trips: page.trips, hasMore: page.next_cursor !== null, detail: null, seq: 0, ...extra,
})
const detailState = (phase: NonNullable<LibraryState['detail']>['phase'], seq = 1): LibraryState =>
  ready(TRIPS_PAGE_FIXTURE, { seq, detail: { tripId: TRIP_ID, seq, phase } })
const readyPhase = () => ({ kind: 'ready' as const, data: widgetData(MULTI_SOURCE_RESPONSE) })

function show(state: LibraryState, h: { onOpenTrip?: (id: string) => void; onBack?: () => void } = {}) {
  const props = { onOpenTrip: h.onOpenTrip ?? vi.fn(), onBack: h.onBack ?? vi.fn(), onDayChange: vi.fn() }
  const view = render(<TripLibrary state={state} {...props} />)
  return { ...view, props, again: (s: LibraryState) => view.rerender(<TripLibrary state={s} {...props} />) }
}

describe('TripLibrary tap-target scope', () => {
  it('marks its outermost element in list and detail states', () => {
    const { container, again } = show(ready(TRIPS_PAGE_FIXTURE))
    expect(container.firstElementChild).toHaveAttribute('data-library')
    again(detailState(readyPhase()))
    expect(container.firstElementChild).toHaveAttribute('data-library')
  })
})

describe('TripLibrary list', () => {
  it('renders each trip and opens it with one tap', () => {
    const { props } = show(ready(TRIPS_PAGE_FIXTURE))
    for (const t of TRIPS_PAGE_FIXTURE.trips) {
      const row = screen.getByRole('button', { name: `Open ${t.title}` })
      expect(row).toHaveTextContent(tripDateRange(t))
      expect(row).toHaveTextContent(tripStatusLabel(t.status))
      expect(row).toHaveTextContent('3 days')
      expect(row).toHaveClass('min-h-12')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open Kyoto long weekend' }))
    expect(props.onOpenTrip).toHaveBeenCalledWith(TRIPS_PAGE_FIXTURE.trips[1].trip_id)
  })

  it('shows empty, error and loading states', () => {
    show(ready(EMPTY_TRIPS_PAGE))
    expect(screen.getByText('No trips yet')).toBeInTheDocument()
    cleanup()
    show({ ...ready(EMPTY_TRIPS_PAGE), list: { kind: 'error', message: 'Sign in again.' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in again.')
    cleanup()
    show({ ...ready(EMPTY_TRIPS_PAGE), list: { kind: 'loading' } })
    expect(screen.getByRole('status', { name: 'Loading trips' })).toBeInTheDocument()
  })

  it('notes older trips only when there are more', () => {
    const note = 'Showing your 50 most recent trips. Ask ChatGPT about older ones.'
    show(ready(MORE_TRIPS_PAGE))
    expect(screen.getByText(note)).toBeInTheDocument()
    cleanup()
    show(ready(TRIPS_PAGE_FIXTURE))
    expect(screen.queryByText(note)).toBeNull()
  })

  it('renders a hostile title as text', () => {
    const trip = { ...TRIPS_PAGE_FIXTURE.trips[0], title: '<script>alert(1)</script>' }
    const { container } = show(ready({ ...TRIPS_PAGE_FIXTURE, trips: [trip] }))
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })
})

describe('TripLibrary detail', () => {
  it('shows the itinerary under a back button', () => {
    const { props } = show(detailState(readyPhase()))
    expect(screen.getByRole('group', { name: 'Trip days' })).toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Back to all trips' })
    expect(back).toHaveClass('min-h-12')
    expect(back.parentElement).toHaveClass('pt-[var(--safe-top,0px)]')
    fireEvent.click(back)
    expect(props.onBack).toHaveBeenCalled()
  })

  it('keeps the back button on a failed open', () => {
    show(detailState({ kind: 'error', message: 'nope' }))
    expect(screen.getByRole('button', { name: 'Back to all trips' })).toBeInTheDocument()
  })

  it('a fresh open of the same trip remounts the detail on its first day', () => {
    const { again } = show(detailState(readyPhase(), 1))
    const days = () => screen.getByRole('group', { name: 'Trip days' })
    fireEvent.click(within(days()).getByRole('button', { name: /^Day 2\b/ }))
    expect(within(days()).getByRole('button', { name: /^Day 2\b/ })).toHaveAttribute('aria-current', 'true')
    again(detailState(readyPhase(), 2))
    expect(within(days()).getByRole('button', { name: /^Day 1\b/ })).toHaveAttribute('aria-current', 'true')
  })
})

describe('TripLibrary map backstop', () => {
  function showMap(state: LibraryState) {
    const onMapFailed = vi.fn()
    const props = { onOpenTrip: vi.fn(), onBack: vi.fn(), onDayChange: vi.fn(), onMapFailed }
    const tree = (s: LibraryState) => (
      <MapProvider accessToken="pk.test"><TripLibrary state={s} hasMap {...props} /></MapProvider>
    )
    const view = render(tree(state))
    return { ...view, onMapFailed, again: (s: LibraryState) => view.rerender(tree(s)) }
  }
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

  beforeEach(() => {
    resetMapbox()
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('latches when the map is not ready 15 s after a map detail mounts', async () => {
    const { onMapFailed, container } = showMap(detailState(readyPhase()))
    expect(container.querySelector('[data-library-map]')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS - 1) })
    expect(onMapFailed).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(onMapFailed).toHaveBeenCalledTimes(1)
  })

  it('never starts on the list', async () => {
    const { onMapFailed } = showMap(ready(TRIPS_PAGE_FIXTURE))
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS * 2) })
    expect(onMapFailed).not.toHaveBeenCalled()
  })

  it('is cancelled when the map becomes ready', async () => {
    const { onMapFailed } = showMap(detailState(readyPhase()))
    await flush()
    expect(MapCtor).toHaveBeenCalledTimes(1)
    act(() => { fire('load') })
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS * 2) })
    expect(onMapFailed).not.toHaveBeenCalled()
  })

  it('is cancelled on Back and on unmount', async () => {
    const backed = showMap(detailState(readyPhase()))
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS - 1) })
    backed.again(ready(TRIPS_PAGE_FIXTURE))
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS * 2) })
    expect(backed.onMapFailed).not.toHaveBeenCalled()
    cleanup()

    const unmounted = showMap(detailState(readyPhase()))
    unmounted.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(MAP_BACKSTOP_MS * 2) })
    expect(unmounted.onMapFailed).not.toHaveBeenCalled()
  })
})
