/* DayHeaderCard's summary clamp (Codex round 4 F4): the two-line clamp ships only with its More
   control. Character count does not predict rendered lines, so a short summary is never clamped. */
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TripDay } from '@/lib/trip/backend-types'
import DayHeaderCard from '@/components/trip/panel/DayHeaderCard'

const day = (summary: string | null): TripDay => ({
  id: 'day_1', trip_id: 'trip_1', day_number: 1, day_date: '2026-10-12', title: 'Lanterns',
  summary, weather_summary: null, weather_source: null, weather_payload: {},
})

const summaryEl = () => document.querySelector<HTMLElement>('[data-day-summary]')!

describe('DayHeaderCard summary', () => {
  it('shows a short multiline CJK summary in full, with no clamp and no More', () => {
    // 80 characters: short by count, but CJK at phone width wraps to about four lines.
    const cjk = '浅草寺の朝は静かで、提灯の光がとても美しい。仲見世通りで人形焼を買ってから、合羽橋で包丁を探す一日。'.repeat(2).slice(0, 80)
    render(<DayHeaderCard day={day(`${cjk}\n二行目`)} />)
    expect(summaryEl().className).not.toMatch(/line-clamp/)
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
    expect(summaryEl()).toHaveTextContent('二行目')
  })

  it('clamps a long summary to two lines with More, and More/Less toggles the clamp', () => {
    render(<DayHeaderCard day={day('An early temple, snacks on the approach, then knives. '.repeat(4))} />)
    expect(summaryEl().className).toMatch(/\bline-clamp-2\b/)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(summaryEl().className).not.toMatch(/line-clamp/)
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Less' }))
    expect(summaryEl().className).toMatch(/\bline-clamp-2\b/)
  })

  it('renders no summary block when there is none', () => {
    render(<DayHeaderCard day={day(null)} />)
    expect(document.querySelector('[data-day-summary]')).toBeNull()
  })
})
