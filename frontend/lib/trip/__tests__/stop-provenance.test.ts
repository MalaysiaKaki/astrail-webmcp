import { describe, it, expect } from 'vitest'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripPlace } from '@/lib/trip/backend-types'
import { stopProvenance } from '@/lib/trip/stop-provenance'

const stop = (id: string) => TOKYO_TRIP.places.find((p) => p.id === id)!
const withEvidence = (tp: TripPlace, patch: Partial<TripPlace['evidence_json']>): TripPlace =>
  ({ ...tp, evidence_json: { ...tp.evidence_json, ...patch } })

describe('stopProvenance', () => {
  it('shows the verbatim Reel quote for an extracted stop', () => {
    expect(stopProvenance(stop('tp_akasaka'))).toEqual({
      kind: 'reel', label: 'From a Reel', text: 'HARRY POTTER TRAIN STATION IN TOKYO!',
    })
  })

  it('labels a requested stop as the traveller’s own, with their words when we hold them', () => {
    expect(stopProvenance(stop('tp_disney'))).toEqual({
      kind: 'requested', label: 'You asked for this', text: 'Also want to go Tokyo Disneyland',
    })
    expect(stopProvenance(withEvidence(stop('tp_disney'), { quote: null })))
      .toEqual({ kind: 'requested', label: 'You asked for this', text: null })
  })

  it('gives a suggestion its rationale, not a quote it never had', () => {
    expect(stopProvenance(stop('tp_ichiran'))).toEqual({
      kind: 'suggested', label: 'Astrail suggestion',
      text: 'Ramen to close the sando day, matching your ramen preference.',
    })
  })

  it('says so honestly when a Reel stop has no caption quote', () => {
    expect(stopProvenance(withEvidence(stop('tp_akasaka'), { quote: null })))
      .toEqual({ kind: 'none', label: 'No caption evidence', text: null })
    expect(stopProvenance(withEvidence(stop('tp_akasaka'), { quote: '   ' })))
      .toEqual({ kind: 'none', label: 'No caption evidence', text: null })
  })

  it('treats a suggestion with no rationale as unevidenced rather than inventing one', () => {
    expect(stopProvenance(withEvidence(stop('tp_ichiran'), { rationale: null })))
      .toEqual({ kind: 'suggested', label: 'Astrail suggestion', text: null })
  })
})
