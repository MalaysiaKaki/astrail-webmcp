import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'
import AboutThisTrip from '@/components/trip/mobile/AboutThisTrip'

vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

/* A3 (Placify revamp): About this trip is one card-link disclosure holding a 2×2 stat grid and a
   card link per section, each opening inline. */

const about = () => screen.getByText('About this trip').closest('details')!
const stat = (label: string) => screen.getByText(label, { selector: '[data-stat-label]' }).closest('[data-stat]')!
const row = (name: string) => screen.getByText(name, { selector: 'summary *' }).closest('details')!
const withStatus = (status: TripBundle['trip']['status']): TripBundle => ({ ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status } })

describe('AboutThisTrip', () => {
  it('is a closed card-link disclosure, so the first screen stays the route', () => {
    render(<AboutThisTrip bundle={TOKYO_TRIP} readOnly />)
    expect(about().open).toBe(false)
    const summary = about().querySelector(':scope > summary')!
    expect(summary.className).toMatch(/\bm-card-link\b/)
    expect(summary.querySelector('.m-chevron')).not.toBeNull()
  })

  it('shows a 2×2 grid of stat cards: places, days, legs and routed distance', () => {
    render(<AboutThisTrip bundle={TOKYO_TRIP} readOnly />)
    const grid = about().querySelector('[data-stat-grid]')!
    expect(grid.className).toMatch(/\bgrid-cols-2\b/)
    expect(grid.querySelectorAll('[data-stat]')).toHaveLength(4)
    for (const s of grid.querySelectorAll('[data-stat]')) expect(s.className).toMatch(/\bm-card\b/)
    expect(stat('Places')).toHaveTextContent(String(TOKYO_TRIP.places.length))
    expect(stat('Days')).toHaveTextContent(String(TOKYO_TRIP.days.length))
    expect(stat('Legs')).toHaveTextContent('3')
    expect(stat('Routed distance')).toHaveTextContent('9.6 km')     // routed legs only (130 m + 9.5 km)
  })

  it('says "—" for routed distance when the trip has no legs, never "0 km"', () => {
    render(<AboutThisTrip bundle={{ ...TOKYO_TRIP, transport_legs: [] }} readOnly />)
    expect(stat('Legs')).toHaveTextContent('0')
    expect(stat('Routed distance')).toHaveTextContent('—')
    expect(about().textContent).not.toMatch(/\b0 km\b/)
  })

  it('offers each section as a card link that opens inline', () => {
    render(<AboutThisTrip bundle={withStatus('saved_with_gaps')} readOnly={false} />)
    for (const name of ['Trip summary', 'Your preferences', 'Trade-offs', 'How Astrail built this',
      'Some stops are missing details', 'How was this trail?']) {
      const d = row(name)
      expect(d.open).toBe(false)
      const s = d.querySelector(':scope > summary')!
      expect(s.className).toMatch(/\bm-card-link\b/)
      expect(s.querySelector('.m-chevron')).not.toBeNull()
    }
    expect(within(row('How was this trail?')).getByTestId('trip-feedback-panel')).toBeInTheDocument()
  })

  it('leaves out rows with nothing behind them, rather than showing dead links', () => {
    const bare: TripBundle = {
      ...withStatus('complete'),
      trip: { ...TOKYO_TRIP.trip, status: 'complete', preference_summary: null, tradeoffs: { notes: [], comparisons: [] } },
    }
    render(<AboutThisTrip bundle={bare} readOnly />)
    expect(screen.queryByText('Your preferences')).toBeNull()
    expect(screen.queryByText('Trade-offs')).toBeNull()
    expect(screen.queryByText('Some stops are missing details')).toBeNull()   // not saved_with_gaps
    expect(screen.queryByText('How was this trail?')).toBeNull()              // read-only sample
    expect(row('Trip summary')).toBeTruthy()
    expect(row('How Astrail built this')).toBeTruthy()
  })

  it('names the stops that are missing details, and what each one lacks', () => {
    const places = TOKYO_TRIP.places.map((tp) => {
      if (tp.id === 'tp_akasaka') return { ...tp, place: { ...tp.place, lat: 0, lng: 0 } }
      if (tp.id === 'tp_hpcafe') return { ...tp, evidence_json: { ...tp.evidence_json, quote: null, quotes: [] } }
      return tp
    })
    render(<AboutThisTrip bundle={{ ...withStatus('saved_with_gaps'), places }} readOnly />)
    const gaps = row('Some stops are missing details')
    expect(within(gaps).getByText('Akasaka Station')).toBeInTheDocument()
    expect(within(gaps).getByText(/no map location/)).toBeInTheDocument()
    expect(within(gaps).getByText('Harry Potter Cafe')).toBeInTheDocument()
    expect(within(gaps).getByText(/no caption evidence/)).toBeInTheDocument()
  })

  it('says honestly when every stop is complete but the trip was still saved with gaps', () => {
    render(<AboutThisTrip bundle={withStatus('saved_with_gaps')} readOnly />)
    expect(within(row('Some stops are missing details')).getByText(/Every stop here has a map location and its evidence/)).toBeInTheDocument()
  })
})
