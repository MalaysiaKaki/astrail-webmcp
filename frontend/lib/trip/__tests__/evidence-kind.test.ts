import { describe, it, expect } from 'vitest'
import { evidenceKindLabel } from '@/lib/trip/evidence-kind'

/* Migrated from EvidenceChip.test (plan A6): the chip's kind label moved to the stop detail. */
describe('evidenceKindLabel', () => {
  it('names every evidence kind the backend writes', () => {
    expect(evidenceKindLabel('reel_quote')).toBe('Reel')
    expect(evidenceKindLabel('requested_by_you')).toBe('You')
    expect(evidenceKindLabel('suggested_by_astrail')).toBe('Astrail')
    expect(evidenceKindLabel('research')).toBe('Research')
    expect(evidenceKindLabel('memory_preference')).toBe('Memory')
  })

  it('falls back to a neutral word for a kind it does not know', () => {
    expect(evidenceKindLabel('brand_new_kind' as never)).toBe('Source')
  })
})
