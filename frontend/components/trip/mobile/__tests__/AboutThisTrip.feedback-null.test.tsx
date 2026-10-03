import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'
import AboutThisTrip from '@/components/trip/mobile/AboutThisTrip'

vi.mock('@/components/trip/TripFeedbackPanel', () => ({ default: () => <div data-testid="trip-feedback-panel" /> }))

/* Task 2 seam: feedback={null} (the widget viewer) hides the feedback row; omitted keeps it. */

const complete: TripBundle = { ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, status: 'complete' } }

describe('AboutThisTrip feedback={null}', () => {
  it('shows no feedback row and no sample copy', () => {
    render(<AboutThisTrip bundle={complete} readOnly={false} feedback={null} />)
    expect(screen.queryByText('How was this trail?')).toBeNull()
    expect(screen.queryByTestId('trip-feedback-panel')).toBeNull()
    expect(screen.queryByText(/A saved example/)).toBeNull()
    expect(screen.queryByText(/Sample/)).toBeNull()
  })

  it('keeps the row when feedback is omitted', () => {
    render(<AboutThisTrip bundle={complete} readOnly={false} />)
    expect(screen.getByText('How was this trail?')).toBeInTheDocument()
    expect(screen.getByTestId('trip-feedback-panel')).toBeInTheDocument()
  })
})
