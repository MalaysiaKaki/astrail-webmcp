/**
 * The richer v3 card: Reel photos and evidence links under the host's OPAQUE origin, the "Open in
 * Astrail" action, and the per-day route map.
 *
 * jsdom's `location` cannot be redefined, so the sandbox is reproduced at the one place that read it:
 * safeHref here is the REAL rule evaluated with origin "null", exactly what a sandboxed iframe
 * reports. Before the fix, every cover and evidence link vanished in ChatGPT for this reason.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@/lib/safe-href', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safe-href')>()
  return { ...actual, safeHref: (url: string | null | undefined) => actual.safeHrefWithBase(url, 'null') }
})

import ItineraryWidget from '../ItineraryWidget'
import { COVER_ASAKUSA, COVER_TEAMLAB, FIXTURE_IDS, MULTI_SOURCE_RESPONSE } from '../__fixtures__/multi-source-bundle'
import { fixtureLinks, widgetData } from './tool-results'

afterEach(cleanup)

const TRIP_URL = `https://astrail.test/app/trip/${FIXTURE_IDS.trip}`
const dayCell = (n: number) => screen.getByRole('button', { name: new RegExp(`^Day ${n}\\b`) })
const cardFor = (name: string) => screen.getByText(name, { selector: 'span' }).closest<HTMLElement>('[data-stop-card]')!

function renderRich(links = fixtureLinks(FIXTURE_IDS.trip)) {
  return render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE, null, links)} restored={null} />)
}

describe('photos and links inside an opaque-origin sandbox', () => {
  it('renders the Reel covers as real images in the hero and in the stop cards', () => {
    renderRich()
    const hero = screen.getByTestId('trip-hero')
    expect([...hero.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([COVER_ASAKUSA, COVER_TEAMLAB])
    expect(within(hero).getByRole('img', { name: '2 Reels behind this trip' })).toBeInTheDocument()
    expect(cardFor('Sensō-ji').querySelector('[data-evidence] img')?.getAttribute('src')).toBe(COVER_ASAKUSA)
  })

  it('keeps the Reel, Source and Evidence links', () => {
    renderRich()
    fireEvent.click(cardFor('Sensō-ji').querySelector('button[data-place-id]')!)
    const card = cardFor('Sensō-ji')
    expect(within(card).getByRole('link', { name: /Watch the Reel/ })).toHaveAttribute('href', 'https://www.instagram.com/reel/DAsakusa01/')
    expect(within(card).getByRole('link', { name: /^Evidence/ })).toHaveAttribute('href', 'https://www.asakusaimahan.co.jp/')
    fireEvent.click(cardFor('Kappabashi Kitchen Street').querySelector('button[data-place-id]')!)
    expect(within(cardFor('Kappabashi Kitchen Street')).getByRole('link', { name: /^Source/ }))
      .toHaveAttribute('href', 'https://www.kappabashi.or.jp/en/')
  })
})

describe('"Open in Astrail"', () => {
  it('is a primary kit button that opens the trip in a new tab', () => {
    renderRich()
    const open = screen.getByRole('link', { name: /Open in Astrail/ })
    expect(open).toHaveAttribute('href', TRIP_URL)
    expect(open).toHaveAttribute('target', '_blank')
    expect(open.getAttribute('rel')).toContain('noopener')
    expect(open.className).toMatch(/\bm-btn-primary\b/)
  })

  it('is absent without links', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(screen.queryByRole('link', { name: /Open in Astrail/ })).toBeNull()
  })
})

describe('the per-day route map', () => {
  it('shows the selected day\'s map at the top of the day; tapping it opens the trip', () => {
    renderRich()
    const map = screen.getByRole('img', { name: 'Route map for Day 1' })
    expect(map).toHaveAttribute('src', 'https://astrail.test/api/mcp/static-map?p=day1&s=sig')
    expect(map.closest('a')).toHaveAttribute('href', TRIP_URL)
    const day = screen.getByRole('region', { name: 'Day 1' })
    expect(day.firstElementChild).toBe(map.closest('[data-day-map]'))
    fireEvent.click(dayCell(2))
    expect(screen.getByRole('img', { name: 'Route map for Day 2' })).toHaveAttribute('src', 'https://astrail.test/api/mcp/static-map?p=day2&s=sig')
  })

  it('renders nothing for a day without a map URL — no empty frame, no broken image', () => {
    renderRich()
    fireEvent.click(dayCell(3))
    expect(screen.queryByRole('img', { name: /Route map/ })).toBeNull()
    expect(document.querySelector('[data-day-map]')).toBeNull()
  })

  it('hides itself when the image fails to load, and comes back for another day\'s map', () => {
    renderRich()
    fireEvent.error(screen.getByRole('img', { name: 'Route map for Day 1' }))
    expect(screen.queryByRole('img', { name: 'Route map for Day 1' })).toBeNull()
    fireEvent.click(dayCell(2))
    expect(screen.getByRole('img', { name: 'Route map for Day 2' })).toBeInTheDocument()
  })

  it('shows no map at all without links', () => {
    render(<ItineraryWidget data={widgetData(MULTI_SOURCE_RESPONSE)} restored={null} />)
    expect(document.querySelector('[data-day-map]')).toBeNull()
  })

  it('never renders a map URL that is not http(s)', () => {
    renderRich({ trip_url: TRIP_URL, day_maps: { 1: 'javascript:alert(1)' } })
    expect(document.querySelector('[data-day-map]')).toBeNull()
  })
})

describe('a day with more located stops than the map pins (G5)', () => {
  // Day 1 rebuilt with n located stops, each a distinct place, in stop order.
  function withDay1Stops(n: number) {
    const template = MULTI_SOURCE_RESPONSE.bundle.places.find((tp) => tp.day_number === 1)!
    const hex = (i: number) => (0x9000 + i).toString(16).padStart(12, '0')
    const stops = Array.from({ length: n }, (_, i) => ({
      ...template,
      id: `00000000-0000-4000-8000-${hex(i)}`,
      place_id: `00000000-0000-4000-8001-${hex(i)}`,
      sort_order: i + 1,
      place: { ...template.place, id: `00000000-0000-4000-8001-${hex(i)}`, name: `Stop ${i + 1}`, lat: 35.7 + i / 1000 },
    }))
    return {
      ...MULTI_SOURCE_RESPONSE,
      bundle: {
        ...MULTI_SOURCE_RESPONSE.bundle,
        places: [...MULTI_SOURCE_RESPONSE.bundle.places.filter((tp) => tp.day_number !== 1), ...stops],
        transport_legs: [],
        restaurants: [],
      },
    }
  }

  it('26 located stops: the map says it shows the first 25, and the timeline keeps all 26', () => {
    render(<ItineraryWidget data={widgetData(withDay1Stops(26), 1, fixtureLinks(FIXTURE_IDS.trip))} restored={null} />)
    const map = screen.getByRole('img', { name: 'Route map for Day 1' }).closest<HTMLElement>('[data-day-map]')!
    expect(within(map).getByText('Map shows the first 25 stops')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-stop-card]')).toHaveLength(26)
  })

  it('25 located stops: no caption (control)', () => {
    render(<ItineraryWidget data={widgetData(withDay1Stops(25), 1, fixtureLinks(FIXTURE_IDS.trip))} restored={null} />)
    expect(screen.getByRole('img', { name: 'Route map for Day 1' })).toBeInTheDocument()
    expect(screen.queryByText(/Map shows the first/)).toBeNull()
  })
})
