import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ItineraryWidget, { WidgetView } from '../ItineraryWidget'
import {
  CAPPED_INSPIRATION_RESPONSE, CAPPED_QUOTES_RESPONSE, COVER_ASAKUSA, COVER_TEAMLAB,
  DAY_TWO_START_RESPONSE, FIXTURE_IDS, MULTI_SOURCE_RESPONSE, NO_DAYS_RESPONSE,
  NO_QUOTES_COMPLETE_RESPONSE, NO_REELS_COMPLETE_RESPONSE, TRUNCATED_RESPONSE, TWELVE_DAY_RESPONSE,
} from '../__fixtures__/multi-source-bundle'
import { widgetData } from './tool-results'

afterEach(cleanup)

const TRIP = FIXTURE_IDS.trip
const DAY1_STOPS = ['Sensō-ji', 'Nakamise-dori', 'Kappabashi Kitchen Street']
const DAY2_STOPS = ['teamLab Planets', 'Tsukiji Outer Market']

/** The strip cell's accessible name: "Day 2, Tue 13 Oct". */
const dayCell = (n: number, container: HTMLElement = document.body) =>
  within(container).getByRole('button', { name: new RegExp(`^Day ${n}\\b`) })

function activeDay(container: HTMLElement = document.body): string | null {
  return within(container).getByRole('group', { name: 'Trip days' })
    .querySelector('[aria-current="true"]')?.getAttribute('aria-label') ?? null
}

/** StopCard's name line, in timeline order. */
function stopNames(container: HTMLElement = document.body): string[] {
  return [...container.querySelectorAll('[data-stop-card] button[data-place-id] span.min-w-0.flex-1 > span:first-child')]
    .map((n) => n.textContent ?? '')
}

function cardFor(name: string): HTMLElement {
  return screen.getByText(name, { selector: 'span' }).closest<HTMLElement>('[data-stop-card]')!
}

const openCard = (name: string) => fireEvent.click(cardFor(name).querySelector('button[data-place-id]')!)

function renderWidget(response = MULTI_SOURCE_RESPONSE, focusDay: number | null = null) {
  return render(<ItineraryWidget data={widgetData(response, focusDay)} restored={null} />)
}

describe('ItineraryWidget (Placify)', () => {
  it('renders the hero, the date strip and Day 1 stop cards by default', () => {
    renderWidget()
    const hero = screen.getByTestId('trip-hero')
    // The phone page's title is the destination (tripTitle), with the date range and stat chips.
    expect(within(hero).getByRole('heading', { name: 'Tokyo, Japan' })).toBeInTheDocument()
    expect(within(hero).getByText('Oct 12 – Oct 14')).toBeInTheDocument()
    expect(within(hero).getByRole('img', { name: '2 Reels behind this trip' })).toBeInTheDocument()
    expect(within(hero).getByRole('list', { name: 'Trip at a glance' })).toHaveTextContent('6places')
    expect(activeDay()).toMatch(/^Day 1\b/)
    expect(screen.getByTestId('day-header-card')).toHaveTextContent('Lanterns and kitchenware')
    expect(stopNames()).toEqual(DAY1_STOPS)
  })

  it('switches days by NUMBER and reports the selection for persistence', () => {
    const onDayChange = vi.fn()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} onDayChange={onDayChange} />)
    fireEvent.click(dayCell(2))
    expect(onDayChange).toHaveBeenCalledWith({ trip_id: TRIP, day: 2 })
    expect(activeDay()).toMatch(/^Day 2\b/)
    expect(stopNames()).toEqual(DAY2_STOPS)
  })

  it('opens on a valid focus_day and ignores an invalid one', () => {
    renderWidget(MULTI_SOURCE_RESPONSE, 2)
    expect(activeDay()).toMatch(/^Day 2\b/)
    cleanup()
    renderWidget(MULTI_SOURCE_RESPONSE, 12)
    expect(activeDay()).toMatch(/^Day 1\b/)
  })

  it('restores the host day for the same trip, never a stale one', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: TRIP, day: 3 }} />)
    expect(activeDay()).toMatch(/^Day 3\b/)
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: TRIP, day: 6 }} />)
    expect(activeDay()).toMatch(/^Day 1\b/)
    cleanup()
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={{ trip_id: FIXTURE_IDS.otherTrip, day: 2 }} />)
    expect(activeDay()).toMatch(/^Day 1\b/)
  })

  it('starts a view that begins at Day 2 on Day 2', () => {
    renderWidget(DAY_TWO_START_RESPONSE)
    expect(activeDay()).toMatch(/^Day 2\b/)
    expect(screen.queryByRole('button', { name: /^Day 1\b/ })).toBeNull()
    expect(stopNames()).toEqual(DAY2_STOPS)
  })

  it('shows the no-days state for a trip with no scheduled days, with its stay list', () => {
    renderWidget(NO_DAYS_RESPONSE)
    expect(screen.getByText('This trip has no scheduled days yet.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Trip days' })).toBeNull()
    expect(screen.getByText('Shibuya Sky')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where to stay' })).toBeInTheDocument()
  })

  it('keeps two widget instances independent', () => {
    const { container: a } = renderWidget()
    const { container: b } = renderWidget()
    fireEvent.click(dayCell(3, a))
    expect(activeDay(a)).toMatch(/^Day 3\b/)
    expect(activeDay(b)).toMatch(/^Day 1\b/)
    expect(stopNames(b)).toEqual(DAY1_STOPS)
  })

  it('covers: a Reel stop shows its Reel frame; a requested stop with Reel evidence and an Astrail pick do not', () => {
    renderWidget()
    expect(cardFor('Sensō-ji').querySelector('[data-evidence] img')?.getAttribute('src')).toBe(COVER_ASAKUSA)
    // The traveller's own request keeps its quote, but thumbnailFor gives it no Reel frame.
    expect(within(cardFor('Nakamise-dori')).getByText('“grab ningyo-yaki on Nakamise on the way in”')).toBeInTheDocument()
    expect(cardFor('Nakamise-dori').querySelector('img')).toBeNull()
    expect(within(cardFor('Kappabashi Kitchen Street')).getByText('Astrail suggestion')).toBeInTheDocument()
    expect(cardFor('Kappabashi Kitchen Street').querySelector('img')).toBeNull()
    fireEvent.click(dayCell(2))
    expect(cardFor('teamLab Planets').querySelector('[data-evidence] img')?.getAttribute('src')).toBe(COVER_TEAMLAB)
  })

  it('shows the day weather chip from the stored summary, and none for a day without weather', () => {
    renderWidget()
    expect(screen.getByTestId('weather-chip')).toHaveTextContent('Clear, 16–23°C')
    fireEvent.click(dayCell(2))
    expect(screen.getByTestId('weather-chip')).toHaveTextContent('Showers likely')
    fireEvent.click(dayCell(3))
    expect(screen.queryByTestId('weather-chip')).toBeNull()
  })

  it('names a suggestion-only restaurant through suggestion_places, in its stop card', () => {
    renderWidget()
    expect(within(cardFor('Sensō-ji')).getByText('1 place to eat nearby')).toBeInTheDocument()
    openCard('Sensō-ji')
    expect(within(cardFor('Sensō-ji')).getByText('Asakusa Imahan')).toBeInTheDocument()
    fireEvent.click(dayCell(2))
    openCard('Tsukiji Outer Market')
    // No place behind this one: the eat card says so rather than inventing a name.
    expect(within(cardFor('Tsukiji Outer Market')).getByText('Suggested spot')).toBeInTheDocument()
  })

  it('renders a legs-only day with its leg connector', () => {
    renderWidget()
    fireEvent.click(dayCell(3))
    expect(screen.getByText(/Allow about 45 minutes to Haneda by train/)).toBeInTheDocument()
    // A complete view: the day genuinely has no stops, so the phone's own wording is true here.
    expect(screen.getByText('No stops planned for this day.')).toBeInTheDocument()
  })

  it('opens a stop card on tap and closes it on a second tap', () => {
    renderWidget()
    const button = cardFor('Nakamise-dori').querySelector('button[data-place-id]')!
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(cardFor('Nakamise-dori')).getByText('Asakusa, Tokyo, Japan')).toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the Stay view from the strip: rank-first, the recommendation, an unresolved location', () => {
    renderWidget()
    expect(screen.queryByRole('heading', { name: 'Where to stay' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveAttribute('aria-current', 'true')
    expect(activeDay()).toBe('Stay')
    const stay = screen.getByRole('region', { name: 'Where to stay' })
    expect(within(stay).getByText('3 hotels')).toBeInTheDocument()
    const cards = [...stay.querySelectorAll<HTMLElement>('[data-hotel-card]')]
    expect(cards.map((c) => c.querySelector('span.font-semibold')?.textContent))
      .toEqual(['Asakusa Riverside Hotel', 'Kuramae Loft Stay', 'Ueno Park Suites'])
    const [riverside, kuramae] = cards
    expect(within(kuramae).getByText('Location unconfirmed.')).toBeInTheDocument()
    expect(within(kuramae).getByText('380 SGD total · Kuramae')).toBeInTheDocument()
    expect(within(riverside).getByText('Recommended')).toBeInTheDocument()
    expect(within(riverside).getByText('214 SGD/night · Asakusa · 4★ · 8.7/10 guests')).toBeInTheDocument()
    expect(within(stay).queryAllByText('Location unconfirmed.')).toHaveLength(1)
    // Read-only: no hub-picker buttons without a map to pick for.
    expect(within(stay).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByTestId('day-header-card')).toBeNull()
    // Back to a day from the strip.
    fireEvent.click(dayCell(2))
    expect(stopNames()).toEqual(DAY2_STOPS)
  })

  it('lists unscheduled stops by name', () => {
    renderWidget()
    expect(within(screen.getByRole('region', { name: 'Not on a day yet' })).getByText('Shibuya Sky')).toBeInTheDocument()
  })

  it('shows the truncation banner with shown and saved day counts', () => {
    renderWidget(TRUNCATED_RESPONSE)
    expect(screen.getByRole('note')).toHaveTextContent('Showing part of this trip (2 of 3 days)')
    cleanup()
    renderWidget()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('offers Expand only when fullscreen is available', () => {
    const onRequestFullscreen = vi.fn()
    renderWidget()
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

  it('does not claim "no stops planned" when the view was capped, and keeps the day\'s places to eat', () => {
    renderWidget(withoutDay2Stops(true), 2)
    expect(screen.getByText(/No stops included in this partial view/)).toBeInTheDocument()
    expect(screen.queryByText(/No stops planned/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where to eat' })).toBeInTheDocument()
    expect(screen.getByText('Suggested spot')).toBeInTheDocument()
  })

  it('keeps the ordinary empty state for a complete view (control)', () => {
    renderWidget(withoutDay2Stops(false), 2)
    expect(screen.queryByText(/partial view/)).not.toBeInTheDocument()
    expect(screen.getByText('No stops planned for this day.')).toBeInTheDocument()
  })
})

describe('places to eat carry no map affordance (Codex round 4 F1)', () => {
  function expectPlainEatCards() {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-eat-card]')]
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) {
      expect(within(c).queryByRole('button')).toBeNull()
      expect(c.querySelector('.m-chevron')).toBeNull()
    }
    expect(screen.queryByRole('button', { name: /on the map/ })).toBeNull()
  }

  it('anchored: the eat card inside an opened stop is plain and keeps Evidence', () => {
    renderWidget()
    openCard('Sensō-ji')
    expectPlainEatCards()
    expect(within(cardFor('Sensō-ji')).getByRole('link', { name: /^Evidence/ }))
      .toHaveAttribute('href', 'https://www.asakusaimahan.co.jp/')
  })

  it('unanchored: the day-level "Where to eat" cards are plain too', () => {
    const unanchored = {
      ...MULTI_SOURCE_RESPONSE,
      bundle: {
        ...MULTI_SOURCE_RESPONSE.bundle,
        restaurants: MULTI_SOURCE_RESPONSE.bundle.restaurants.map((r) => ({ ...r, near_place_id: null })),
      },
    }
    renderWidget(unanchored)
    expect(screen.getByRole('heading', { name: 'Where to eat' })).toBeInTheDocument()
    expect(screen.getByText('Asakusa Imahan')).toBeInTheDocument()
    expectPlainEatCards()
  })

  it('partial day: the capped day\'s eat cards are plain too', () => {
    const capped = {
      ...MULTI_SOURCE_RESPONSE,
      bundle: {
        ...MULTI_SOURCE_RESPONSE.bundle,
        places: MULTI_SOURCE_RESPONSE.bundle.places.filter((tp) => tp.day_number !== 1),
        transport_legs: [],
      },
      truncated: { ...MULTI_SOURCE_RESPONSE.truncated, stops: true },
    }
    renderWidget(capped, 1)
    expect(screen.getByText('Asakusa Imahan')).toBeInTheDocument()
    expectPlainEatCards()
  })
})

describe('absence claims from a bounded view (Codex round 4 F2)', () => {
  const cluster = () => within(screen.getByTestId('trip-hero')).getByRole('img')

  it('capped inspiration: the hero does not claim the trip has no Reels', () => {
    renderWidget(CAPPED_INSPIRATION_RESPONSE)
    expect(cluster()).toHaveAccessibleName('Reel covers not included in this view')
    expect(screen.queryByText(/No Reels recorded/)).toBeNull()
    // The Reel stops themselves are still there, quote and all.
    expect(within(cardFor('Sensō-ji')).getByText('From a Reel')).toBeInTheDocument()
  })

  it('complete result with no Reel rows keeps the categorical wording (control)', () => {
    renderWidget(NO_REELS_COMPLETE_RESPONSE)
    expect(cluster()).toHaveAccessibleName('No Reels recorded for this trip')
  })

  it('capped quotes: no "No caption evidence"', () => {
    renderWidget(CAPPED_QUOTES_RESPONSE)
    expect(within(cardFor('Sensō-ji')).getByText('Caption not included in this view')).toBeInTheDocument()
    expect(screen.queryByText('No caption evidence')).toBeNull()
  })

  it('complete result with quote-less Reel stops keeps "No caption evidence" (control)', () => {
    renderWidget(NO_QUOTES_COMPLETE_RESPONSE)
    expect(within(cardFor('Sensō-ji')).getByText('No caption evidence')).toBeInTheDocument()
  })
})

describe('the hero (preferences, no missing-details badge)', () => {
  it('a saved-with-gaps trip shows no missing-details badge in the hero', () => {
    renderWidget(NO_QUOTES_COMPLETE_RESPONSE)   // status saved_with_gaps, two quote-less stops
    const hero = screen.getByTestId('trip-hero')
    expect(within(hero).queryByRole('button')).toBeNull()
    expect(hero).not.toHaveTextContent(/missing details|details missing/i)
  })

  it('shows the preferences the trip was planned with, as chips', () => {
    renderWidget()
    const prefs = within(screen.getByTestId('trip-hero')).getByTestId('personal-badge')
    expect(prefs).toHaveAccessibleName('Planned with your preferences: Slow mornings, Street food, One big view')
    expect(prefs).toHaveTextContent('Slow mornings')
    expect(prefs).not.toHaveTextContent('+')
  })

  it('shows no preferences line when none were claimed', () => {
    const none = { ...MULTI_SOURCE_RESPONSE, bundle: { ...MULTI_SOURCE_RESPONSE.bundle, trip: { ...MULTI_SOURCE_RESPONSE.bundle.trip, preference_sources: [] } } }
    renderWidget(none)
    expect(screen.queryByTestId('personal-badge')).toBeNull()
  })
})

describe('the date strip reveals the selected day (Codex round 4 F5)', () => {
  // jsdom has no layout: lay the strip out as the browser does — 16px gutter, 52px cells, 4px gap,
  // a 360px viewport — and let the rects follow the strip's scrollLeft.
  function stubStripLayout() {
    const rect = (left: number, width: number) => ({
      left, right: left + width, width, top: 0, bottom: 60, height: 60, x: left, y: 0, toJSON: () => ({}),
    })
    return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const strip = this.parentElement
      if (this.getAttribute('role') === 'group') return rect(0, 360)
      if (strip?.getAttribute('role') === 'group' && this instanceof HTMLElement) {
        const i = [...strip.children].indexOf(this)
        return rect(16 + i * 56 - strip.scrollLeft, 52)
      }
      return rect(0, 0)
    })
  }

  it('scrolls a focused Day 12 into the strip, horizontally only', () => {
    const layout = stubStripLayout()
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderWidget(TWELVE_DAY_RESPONSE, 12)
    const strip = screen.getByRole('group', { name: 'Trip days' })
    const cell = dayCell(12)
    expect(cell).toHaveAttribute('aria-current', 'true')
    const s = strip.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    expect(strip.scrollLeft).toBeGreaterThan(0)
    expect(c.left).toBeGreaterThanOrEqual(s.left)
    expect(c.right).toBeLessThanOrEqual(s.right)
    expect(scrollIntoView).not.toHaveBeenCalled()   // never the host page's vertical scroll
    // And back: choosing Day 1 again brings the start of the strip into view.
    fireEvent.click(dayCell(1))
    expect(dayCell(1).getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    layout.mockRestore()
    scrollIntoView.mockRestore()
  })
})
