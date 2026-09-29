import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BuildTimeline from '@/components/trip/insights/BuildTimeline'
import { buildSteps, fullLogEvents } from '@/lib/trip/insights/build-steps'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'

describe('BuildTimeline', () => {
  it('renders one card per evidence-backed step, in order, with titles and state chips', () => {
    render(<BuildTimeline bundle={TOKYO_TRIP} />)
    const steps = buildSteps(TOKYO_TRIP)
    const items = screen.getAllByTestId('build-step')
    expect(items).toHaveLength(steps.length)
    expect(items.length).toBeGreaterThanOrEqual(6)
    items.forEach((item, i) => expect(within(item).getByRole('heading', { level: 4 })).toHaveTextContent(steps[i].title))
  })

  it('labels counts as current trip contents', () => {
    render(<BuildTimeline bundle={TOKYO_TRIP} />)
    expect(screen.getByText(`${TOKYO_TRIP.places.length} stops on this trip`)).toBeInTheDocument()
    expect(screen.getByText(/Counts show what's on the trip now/)).toBeInTheDocument()
  })

  it('highlights a warning step and shows its stored message', () => {
    render(<BuildTimeline bundle={TOKYO_TRIP} />)
    const transport = screen.getAllByTestId('build-step').find((el) => el.textContent?.includes('Routed legs'))!
    expect(transport).toHaveAttribute('data-state', 'warning')
    expect(within(transport).getByText('Could not route Ichiran Shibuya → Tokyo Disneyland.')).toBeInTheDocument()
    expect(within(transport).getByText('Warning')).toBeInTheDocument()
  })

  it('marks a step with output but no log as not recorded', () => {
    const sparse: TripBundle = { ...TOKYO_TRIP, events: [] }
    render(<BuildTimeline bundle={sparse} />)
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
  })

  it('Show full log discloses the filtered raw event list', async () => {
    render(<BuildTimeline bundle={TOKYO_TRIP} />)
    const summary = screen.getByText('Show full log')
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    await userEvent.click(summary)
    expect(details.open).toBe(true)
    for (const ev of fullLogEvents(TOKYO_TRIP)) expect(within(details).getByText(ev.message)).toBeInTheDocument()
  })

  it('says so honestly when nothing at all was recorded', () => {
    const empty: TripBundle = { ...TOKYO_TRIP, events: [], places: [], days: [], transport_legs: [], restaurants: [], hotels: [], inspiration: [] }
    render(<BuildTimeline bundle={empty} />)
    expect(screen.queryAllByTestId('build-step')).toHaveLength(0)
    expect(screen.getByText(/No build steps were recorded for this trip/)).toBeInTheDocument()
  })
})
