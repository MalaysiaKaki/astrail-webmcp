import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ItineraryWidget, { WidgetView } from '../ItineraryWidget'
import {
  COVER_ASAKUSA, COVER_TEAMLAB, DAY_TWO_START_RESPONSE, FIXTURE_IDS, MULTI_SOURCE_RESPONSE,
  NO_DAYS_RESPONSE, TRUNCATED_RESPONSE,
} from '../__fixtures__/multi-source-bundle'
import { widgetData } from './tool-results'

afterEach(cleanup)

const TRIP = FIXTURE_IDS.trip

function activeDay(container: HTMLElement = document.body): string | null {
  return within(container).getByRole('tablist').querySelector('[aria-pressed="true"]')?.textContent ?? null
}

function stopNames(container: HTMLElement = document.body): string[] {
  return [...container.querySelectorAll('[data-place-id] h3')].map((h) => h.textContent ?? '')
}

function cardFor(name: string): HTMLElement {
  return screen.getByRole('heading', { name }).closest('button')!
}

describe('ItineraryWidget', () => {
  it('renders the trip header and Day 1 stops by default', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.getByRole('heading', { name: 'Tokyo in three Reels' })).toBeInTheDocument()
    expect(activeDay()).toContain('Day 1')
    expect(stopNames()).toEqual(['Sensō-ji', 'Nakamise-dori', 'Kappabashi Kitchen Street'])
  })

  it('switches days by NUMBER and reports the selection for persistence', () => {
    const onDayChange = vi.fn()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} onDayChange={onDayChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /Day 2/ }))
    expect(onDayChange).toHaveBeenCalledWith({ trip_id: TRIP, day: 2 })
    expect(activeDay()).toContain('Day 2')
    expect(stopNames()).toEqual(['teamLab Planets', 'Tsukiji Outer Market'])
  })

  it('opens on a valid focus_day and ignores an invalid one', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE, 2)} restored={null} />)
    expect(activeDay()).toContain('Day 2')
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE, 12)} restored={null} />)
    expect(activeDay()).toContain('Day 1')
  })

  it('restores the host day for the same trip, never a stale one', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: TRIP, day: 3 }} />)
    expect(activeDay()).toContain('Day 3')
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: TRIP, day: 6 }} />)
    expect(activeDay()).toContain('Day 1')
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: FIXTURE_IDS.otherTrip, day: 2 }} />)
    expect(activeDay()).toContain('Day 1')
  })

  it('starts a view that begins at Day 2 on Day 2', () => {
    render(<ItineraryWidget data={widgetData(DAY_TWO_START_RESPONSE)} restored={null} />)
    expect(activeDay()).toContain('Day 2')
    expect(stopNames()).toEqual(['teamLab Planets', 'Tsukiji Outer Market'])
  })

  it('shows the no-days state for a trip with no scheduled days', () => {
    render(<ItineraryWidget data={widgetData(NO_DAYS_RESPONSE)} restored={null} />)
    expect(screen.getByText('This trip has no scheduled days yet.')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText('Shibuya Sky')).toBeInTheDocument()
  })

  it('keeps two widget instances independent', () => {
    const { container: a } = render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    const { container: b } = render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    fireEvent.click(within(a).getByRole('tab', { name: /Day 3/ }))
    expect(activeDay(a)).toContain('Day 3')
    expect(activeDay(b)).toContain('Day 1')
    expect(stopNames(b)).toEqual(['Sensō-ji', 'Nakamise-dori', 'Kappabashi Kitchen Street'])
  })

  it('covers: a Reel stop shows its Reel frame; a requested stop with Reel evidence and an Astrail pick do not', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(cardFor('Sensō-ji').querySelector('img')?.getAttribute('src')).toBe(COVER_ASAKUSA)
    expect(cardFor('Nakamise-dori').querySelector('img')).toBeNull()
    expect(cardFor('Nakamise-dori').querySelector('[data-cover="none"]')).not.toBeNull()
    expect(cardFor('Kappabashi Kitchen Street').querySelector('[data-cover="none"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Day 2/ }))
    expect(cardFor('teamLab Planets').querySelector('img')?.getAttribute('src')).toBe(COVER_TEAMLAB)
  })

  it('shows the weather badge only for open_meteo', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.getByText('Clear, 16–23°C')).toBeInTheDocument()
    expect(screen.getByText('Weather')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Day 2/ }))
    expect(screen.getByText('Showers likely')).toBeInTheDocument()
    expect(screen.queryByText('Weather')).toBeNull()
  })

  it('names a suggestion-only restaurant through suggestion_places', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.getByText('Asakusa Imahan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Day 2/ }))
    expect(screen.getByText('Suggested spot')).toBeInTheDocument()
  })

  it('renders a legs-only day with the transport strip', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    fireEvent.click(screen.getByRole('tab', { name: /Day 3/ }))
    expect(screen.getByText(/Allow about 45 minutes to Haneda by train/)).toBeInTheDocument()
    expect(screen.queryByText('No stops planned for this day.')).toBeNull()
  })

  it('lists hotels rank-first, marks the recommendation, and admits an unresolved location', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    const stay = screen.getByRole('heading', { name: 'Where to stay' }).parentElement!
    const names = [...stay.querySelectorAll('li .type-display')].map((n) => n.textContent)
    expect(names).toEqual(['Asakusa Riverside Hotel', 'Kuramae Loft Stay', 'Ueno Park Suites'])
    const kuramae = within(stay).getByText('Kuramae Loft Stay').closest('li')!
    expect(within(kuramae).getByText('Location unconfirmed.')).toBeInTheDocument()
    expect(within(kuramae).getByText('380 SGD total · Kuramae')).toBeInTheDocument()
    const riverside = within(stay).getByText('Asakusa Riverside Hotel').closest('li')!
    expect(within(riverside).getByText('Recommended')).toBeInTheDocument()
    expect(within(riverside).getByText('214 SGD/night · Asakusa · 4★ · 8.7/10 guests')).toBeInTheDocument()
    expect(within(stay).queryAllByText('Location unconfirmed.')).toHaveLength(1)
  })

  it('shows the truncation banner with shown and saved day counts', () => {
    render(<ItineraryWidget data={widgetData(TRUNCATED_RESPONSE)} restored={null} />)
    expect(screen.getByRole('note')).toHaveTextContent('Showing part of this trip (2 of 3 days)')
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('highlights a stop locally on click and clears it on a second click', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    const card = cardFor('Nakamise-dori')
    fireEvent.click(card)
    expect(card).toHaveAttribute('aria-current', 'true')
    fireEvent.click(card)
    expect(card).not.toHaveAttribute('aria-current')
  })

  it('offers Expand only when fullscreen is available', () => {
    const onRequestFullscreen = vi.fn()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull()
    cleanup()
    render(
      <ItineraryWidget
        data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null}
        canFullscreen onRequestFullscreen={onRequestFullscreen}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(onRequestFullscreen).toHaveBeenCalledOnce()
  })
})

describe('WidgetView states', () => {
  it.each([
    [{ kind: 'loading' } as const, 'Loading itinerary'],
    [{ kind: 'waiting' } as const, 'Loading itinerary'],
  ])('%o shows the loading skeleton', (phase, label) => {
    render(<WidgetView phase={phase} restored={null} />)
    expect(screen.getByRole('status', { name: label })).toBeInTheDocument()
  })

  it('shows the cancelled, error and malformed states', () => {
    render(<WidgetView phase={{ kind: 'cancelled' }} restored={null} />)
    expect(screen.getByText('Itinerary request cancelled')).toBeInTheDocument()
    cleanup()
    render(<WidgetView phase={{ kind: 'error', message: 'No trip with that id in your account.' }} restored={null} />)
    expect(screen.getByText('No trip with that id in your account.')).toBeInTheDocument()
    cleanup()
    render(<WidgetView phase={{ kind: 'malformed' }} restored={null} />)
    expect(screen.getByText("Couldn't display this itinerary")).toBeInTheDocument()
  })
})

describe('empty day wording (Codex code review D1)', () => {
  // Day 2's stops cut by the stop cap: the day row survives, its stops do not.
  const withoutDay2Stops = (stopsTruncated: boolean) => ({
    ...MULTI_SOURCE_RESPONSE,
    bundle: {
      ...MULTI_SOURCE_RESPONSE.bundle,
      places: MULTI_SOURCE_RESPONSE.bundle.places.filter((tp) => tp.day_number !== 2),
      transport_legs: [],
    },
    truncated: { ...MULTI_SOURCE_RESPONSE.truncated, stops: stopsTruncated },
  })

  it('does not claim "no stops planned" when the view was capped', () => {
    render(<ItineraryWidget data={widgetData(withoutDay2Stops(true), 2)} restored={null} />)
    expect(screen.getByText(/No stops included in this partial view/)).toBeInTheDocument()
    expect(screen.queryByText(/No stops planned/)).not.toBeInTheDocument()
  })

  it('keeps the ordinary empty state for a complete view (control)', () => {
    render(<ItineraryWidget data={widgetData(withoutDay2Stops(false), 2)} restored={null} />)
    expect(screen.queryByText(/partial view/)).not.toBeInTheDocument()
  })
})
