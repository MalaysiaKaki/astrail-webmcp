import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import TripHero from '@/components/trip/panel/TripHero'
import { heroPreferenceItems } from '@/lib/trip/insights/memory'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'

describe('TripHero', () => {
  it('shows the preferences as chips under one accessible statement, with "+N" for the rest', () => {
    render(<TripHero bundle={TOKYO_TRIP} readOnly preferences={heroPreferenceItems(TOKYO_TRIP)} />)
    const prefs = screen.getByTestId('personal-badge')
    expect(prefs).toHaveAttribute('role', 'group')
    expect(prefs).toHaveAccessibleName('Planned with your preferences: Walkable days, Ramen, Not too rushed, and 1 more')
    expect([...prefs.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['Walkable days', 'Ramen', 'Not too rushed', '+1'])
  })

  it('a generic line announces exactly its own text', () => {
    render(<TripHero bundle={TOKYO_TRIP} readOnly={false} preferences={{ items: ['Planned around your taste'], more: 0, generic: true }} />)
    const prefs = screen.getByTestId('personal-badge')
    expect(prefs).toHaveAccessibleName('Planned around your taste')
    expect(prefs).toHaveTextContent('Planned around your taste')
  })

  it('keeps distinct chips whose truncated labels collide (index keys)', () => {
    render(<TripHero bundle={TOKYO_TRIP} readOnly={false} preferences={{ items: ['Prefer museums with accessib…', 'Prefer museums with accessib…', 'Quiet nights'], more: 1 }} />)
    expect([...screen.getByTestId('personal-badge').querySelectorAll('span')].map((s) => s.textContent))
      .toEqual(['Prefer museums with accessib…', 'Prefer museums with accessib…', 'Quiet nights', '+1'])
  })

  it('renders no preferences line when the helper makes no claim', () => {
    render(<TripHero bundle={TOKYO_TRIP} readOnly={false} preferences={null} />)
    expect(screen.queryByTestId('personal-badge')).toBeNull()
  })

  it('never shows a missing-details badge, even on a trip saved with gaps', () => {
    const gaps = { ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status: 'saved_with_gaps' as const } }
    render(<TripHero bundle={gaps} readOnly={false} preferences={null} />)
    const hero = screen.getByTestId('trip-hero')
    expect(within(hero).queryByRole('button')).toBeNull()
    expect(hero).not.toHaveTextContent(/missing details|details missing/i)
  })
})
