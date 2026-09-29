import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle } from '@/lib/trip/backend-types'
import {
  buildPlaceIndex, buildTrailNumbers, legsForDay, placesForDay, restaurantsForDay,
} from '@/lib/trip/selectors'
import StopTimeline from '@/components/trip/mobile/StopTimeline'

/* Plan A6, amendment 5: the selected stop card is the stop's detail at every width. It carries what
   the retired desktop PlaceIntelPanel, EvidenceChip and evidence popup carried — the quote AND the
   rationale together, the confidence chip (desktop only), the Reel link, the source — with the same
   text-only / hostile-URL contract the popup had. */

function renderSelected(bundle: TripBundle, placeId: string, props: Partial<Parameters<typeof StopTimeline>[0]> = {}) {
  const tp = bundle.places.find((p) => p.place_id === placeId)!
  const day = tp.day_number!
  render(
    <StopTimeline
      bundle={bundle}
      places={placesForDay(bundle, day)}
      legs={legsForDay(bundle, `day_${day}`)}
      restaurants={restaurantsForDay(bundle, `day_${day}`)}
      placeIndex={buildPlaceIndex(bundle)}
      trailNumbers={buildTrailNumbers(bundle)}
      selectedPlaceId={placeId}
      onSelectPlace={() => {}}
      selectedRestaurantPlaceId={null}
      onSelectRestaurant={() => {}}
      {...props}
    />,
  )
  return document.querySelector<HTMLElement>(`[data-place-id="${placeId}"]`)!.closest<HTMLElement>('[data-stop-card]')!
}

describe('the selected stop card as detail', () => {
  it('shows the quote AND the rationale together when both exist', () => {
    const bundle = structuredClone(TOKYO_TRIP)
    bundle.places[0].evidence_json.rationale = 'The Reel names the platform-9¾ themed entrance.'
    const card = renderSelected(bundle, 'pl_akasaka')
    expect(within(card).getByText(/HARRY POTTER TRAIN STATION IN TOKYO!/)).toBeInTheDocument()
    expect(card.querySelector('[data-rationale]')).toHaveTextContent('The Reel names the platform-9¾ themed entrance.')
  })

  it('does not print a suggestion\'s rationale twice (it is already the card\'s evidence text)', () => {
    const suggested = TOKYO_TRIP.places.find((p) => p.source_type === 'agent_suggested')!
    const card = renderSelected(TOKYO_TRIP, suggested.place_id)
    expect(card.querySelector('[data-rationale]')).toBeNull()
    expect(within(card).getAllByText(suggested.evidence_json.rationale!)).toHaveLength(1)
  })

  it('shows the confidence chip with its kind only when asked (desktop), never on a phone', () => {
    const phone = renderSelected(TOKYO_TRIP, 'pl_akasaka')
    expect(phone.querySelector('[data-evidence-chip]')).toBeNull()
    document.body.innerHTML = ''
    const desk = renderSelected(TOKYO_TRIP, 'pl_akasaka', { showConfidence: true })
    expect(desk.querySelector('[data-evidence-chip]')).toHaveTextContent(/Reel · 65% confidence/)
  })

  it('shows no confidence for a stop the traveller asked for ("100%" would be a claim, not a match)', () => {
    const asked = TOKYO_TRIP.places.find((p) => p.source_type === 'user_requested')!
    const card = renderSelected(TOKYO_TRIP, asked.place_id, { showConfidence: true })
    expect(card.querySelector('[data-evidence-chip]')).toBeNull()
  })

  it('links the Reel first, in a new tab', () => {
    const card = renderSelected(TOKYO_TRIP, 'pl_akasaka')
    const reel = within(card).getByRole('link', { name: /watch the reel/i })
    expect(reel).toHaveAttribute('href', TOKYO_TRIP.places[0].evidence_json.source_reel_url)
    expect(reel).toHaveAttribute('target', '_blank')
    expect(reel).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders hostile caption text as text, and links no non-http URL (the popup\'s old contract)', () => {
    const bundle = structuredClone(TOKYO_TRIP)
    bundle.places[0].evidence_json.quote = '<img src=x onerror="alert(1)"> Visit before sunset.'
    bundle.places[0].evidence_json.source_url = 'javascript:alert(document.cookie)'
    bundle.places[0].evidence_json.source_reel_url = 'javascript:alert(document.cookie)'
    const card = renderSelected(bundle, 'pl_akasaka')
    expect(card).toHaveTextContent('<img src=x onerror="alert(1)"> Visit before sunset.')
    expect(card.querySelector('img[src="x"]')).toBeNull()
    for (const a of card.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    expect(within(card).queryByRole('link', { name: /watch the reel/i })).toBeNull()
  })

  it('offers "Show in 3D" for a located stop, and calls back with that stop', () => {
    const onShow3d = vi.fn()
    const card = renderSelected(TOKYO_TRIP, 'pl_akasaka', { onShow3d })
    fireEvent.click(within(card).getByRole('button', { name: /show in 3d/i }))
    expect(onShow3d).toHaveBeenCalledWith('pl_akasaka')
  })

  it('offers no "Show in 3D" without a caller, or for a stop that could not be placed', () => {
    renderSelected(TOKYO_TRIP, 'pl_akasaka')
    expect(screen.queryByRole('button', { name: /show in 3d/i })).toBeNull()
    document.body.innerHTML = ''
    const bundle = structuredClone(TOKYO_TRIP)
    bundle.places[0].place.lat = 0; bundle.places[0].place.lng = 0
    renderSelected(bundle, 'pl_akasaka', { onShow3d: () => {} })
    expect(screen.queryByRole('button', { name: /show in 3d/i })).toBeNull()
  })
})
