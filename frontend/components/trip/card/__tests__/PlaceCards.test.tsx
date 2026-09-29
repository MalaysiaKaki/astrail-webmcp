import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import type { TripBundle } from '@/lib/trip/backend-types'
import StopPlaceCard, { type StopPlaceCardProps } from '@/components/trip/card/StopPlaceCard'
import { EatPlaceCard, HotelPlaceCard } from '@/components/trip/card/SuggestionPlaceCards'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '@/components/webmcp/WebMcpRegistry'
import { useEffect } from 'react'

/* A10 item 2: the desktop map place card family. The stop card carries the same evidence contract
   as the sidebar card (StopDetail.test): quote AND rationale, extra quotes, the local name, safe
   links, requested-stop confidence suppression, 3D. Its sequence is the pins' journey order. */

function stop(bundle: TripBundle, placeId: string, over: Partial<StopPlaceCardProps> = {}) {
  const props: StopPlaceCardProps = {
    bundle, placeId,
    onClose: vi.fn(), onNavigate: vi.fn(), onShow3d: vi.fn(), onSelectEat: vi.fn(),
    onSeeAllEats: vi.fn(), onDayOverview: vi.fn(), onDetailsHere: vi.fn(),
    ...over,
  }
  render(<StopPlaceCard {...props} />)
  return { props, dialog: screen.getByRole('dialog') }
}

describe('StopPlaceCard', () => {
  it('is a nonmodal dialog named by its heading, with "Stop N of M · Day D"', () => {
    const { dialog } = stop(TOKYO_TRIP, 'pl_sandolab')
    expect(dialog).toHaveAccessibleName('SANDO LAB TOKYO')
    expect(dialog).not.toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Stop 3 of 5 · Day 1')).toBeInTheDocument()
  })

  it('prev/next walk the journey order across days and are disabled at the ends', () => {
    const { props } = stop(TOKYO_TRIP, 'pl_ichiran')
    fireEvent.click(screen.getByRole('button', { name: /next stop/i }))
    expect(props.onNavigate).toHaveBeenCalledWith('pl_disney')
    document.body.innerHTML = ''
    stop(TOKYO_TRIP, 'pl_akasaka')
    expect(screen.getByRole('button', { name: /previous stop/i })).toBeDisabled()
  })

  it('shows the quote verbatim, and the rationale, extra quotes and local name as disclosures', () => {
    const b = structuredClone(TOKYO_TRIP)
    const tp = b.places.find((p) => p.place_id === 'pl_akasaka')!
    tp.evidence_json.rationale = 'The Reel names the platform-9¾ themed entrance.'
    tp.evidence_json.quotes = [tp.evidence_json.quote!, 'Second line from the caption']
    tp.place.name_local = '赤坂駅'
    const { dialog } = stop(b, 'pl_akasaka')
    expect(within(dialog).getByText('“HARRY POTTER TRAIN STATION IN TOKYO!”')).toBeInTheDocument()
    expect(dialog.querySelector('[data-rationale]')).toHaveTextContent('The Reel names the platform-9¾ themed entrance.')
    expect(within(dialog).getByText('“Second line from the caption”')).toBeInTheDocument()
    expect(within(dialog).getByText('赤坂駅')).toBeInTheDocument()
    expect(dialog.querySelectorAll('details').length).toBeGreaterThanOrEqual(3)
  })

  it('shows confidence for a Reel stop and never for one the traveller asked for', () => {
    const { dialog } = stop(TOKYO_TRIP, 'pl_akasaka')
    expect(dialog.querySelector('[data-evidence-chip]')).toHaveTextContent(/65% confidence/)
    document.body.innerHTML = ''
    const again = stop(TOKYO_TRIP, 'pl_disney')
    expect(again.dialog.querySelector('[data-evidence-chip]')).toBeNull()
  })

  it('drops a hostile source link and keeps Watch the Reel and Show in 3D', () => {
    const b = structuredClone(TOKYO_TRIP)
    b.places[0].evidence_json.source_url = 'javascript:alert(1)'
    const { dialog, props } = stop(b, 'pl_akasaka')
    expect(within(dialog).queryByRole('link', { name: /source/i })).toBeNull()
    expect(within(dialog).getByRole('link', { name: /watch the reel/i })).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(within(dialog).getByRole('button', { name: /show in 3d/i }))
    expect(props.onShow3d).toHaveBeenCalled()
  })

  it('lists the anchored eats (at most 3), opens one as its card, and offers "See all" for the day', () => {
    // A third day-1 suggestion anchored to no stop: never on this card, but reachable via See all.
    const b = structuredClone(TOKYO_TRIP)
    b.restaurants.push({ ...b.restaurants[0], id: 'rest_x', near_place_id: null, restaurant_place_id: null })
    const { dialog, props } = stop(b, 'pl_sandolab')
    const eats = dialog.querySelectorAll('[data-eat-card]')
    expect(eats.length).toBe(2)
    fireEvent.click(within(dialog).getByRole('button', { name: /show popo/i }))
    expect(props.onSelectEat).toHaveBeenCalledWith('pl_popo')
    fireEvent.click(within(dialog).getByRole('button', { name: /see all 3 places to eat on day 1/i }))
    expect(props.onSeeAllEats).toHaveBeenCalledWith(1)
  })

  it('offers no "See all" when the card already lists every suggestion of the day', () => {
    const { dialog } = stop(TOKYO_TRIP, 'pl_sandolab')
    expect(within(dialog).queryByRole('button', { name: /see all/i })).toBeNull()
  })

  it('links to the day overview and to the sidebar detail', () => {
    const { dialog, props } = stop(TOKYO_TRIP, 'pl_sandolab')
    fireEvent.click(within(dialog).getByRole('button', { name: /day 1 overview/i }))
    expect(props.onDayOverview).toHaveBeenCalledWith(1)
    fireEvent.click(within(dialog).getByRole('button', { name: /details in the sidebar/i }))
    expect(props.onDetailsHere).toHaveBeenCalled()
  })

  it('an undayed place has no "Stop N of M" and no navigation', () => {
    const { dialog } = stop(TOKYO_TRIP_WITH_HOTELS, 'pl_hotelbase')
    expect(within(dialog).queryByText(/Stop \d+ of/)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /next stop/i })).toBeNull()
  })

  it('Escape closes it, and the close button too', () => {
    const { dialog, props } = stop(TOKYO_TRIP, 'pl_sandolab')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledWith('escape')
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(props.onClose).toHaveBeenCalledWith('button')
  })

  it('leaves Escape to a pending agent approval (the approval declines; the card stays)', () => {
    function Pending() {
      const { requestConfirm, setSupported } = useWebMcpRegistry()
      useEffect(() => { setSupported(true); void requestConfirm('Approve this?') }, [requestConfirm, setSupported])
      return null
    }
    const onClose = vi.fn()
    render(
      <WebMcpRegistryProvider>
        <Pending />
        <StopPlaceCard bundle={TOKYO_TRIP} placeId="pl_sandolab" onClose={onClose} onNavigate={vi.fn()}
          onSelectEat={vi.fn()} onSeeAllEats={vi.fn()} onDayOverview={vi.fn()} onDetailsHere={vi.fn()} />
      </WebMcpRegistryProvider>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('eat and hotel cards (same family)', () => {
  it('an eat card states its facts and links back to the stop it sits beside', () => {
    const onClose = vi.fn()
    const onOpenStop = vi.fn()
    const r = TOKYO_TRIP.restaurants.find((x) => x.restaurant_place_id === 'pl_popo')!
    render(<EatPlaceCard bundle={TOKYO_TRIP} placeId="pl_popo" onClose={onClose} onOpenStop={onOpenStop} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(TOKYO_TRIP.suggestion_places.find((p) => p.id === 'pl_popo')!.name)
    if (r.summary) expect(within(dialog).getByText(r.summary)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /sando lab/i }))
    expect(onOpenStop).toHaveBeenCalledWith('pl_sandolab')
  })

  it('a hotel card says it is a search result and never an offer', () => {
    render(<HotelPlaceCard bundle={TOKYO_TRIP_WITH_HOTELS} hotelId="hotel_1" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Search result from Travala/)).toBeInTheDocument()
  })
})
