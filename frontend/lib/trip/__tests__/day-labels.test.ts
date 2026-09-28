import { describe, it, expect } from 'vitest'
import { dayLabel } from '@/lib/trip/day-labels'

describe('dayLabel', () => {
  it('spells a dated day from the date alone, never shifted by the local zone', () => {
    expect(dayLabel({ day_number: 1, day_date: '2026-09-18' })).toEqual({
      big: '18',
      // 2026-09-18 is a Friday (the plan's "Thu 18 Sep" was an illustration of the shape).
      small: 'fri',
      monthDay: 'Sep 18',
      name: 'Day 1, Fri 18 Sep',
    })
  })

  it('crosses a month edge on the calendar date, not on UTC midnight', () => {
    expect(dayLabel({ day_number: 3, day_date: '2026-10-01' })).toMatchObject({
      big: '1', small: 'thu', monthDay: 'Oct 1', name: 'Day 3, Thu 1 Oct',
    })
  })

  it('falls back to "Day N" when the day has no date', () => {
    expect(dayLabel({ day_number: 2, day_date: null })).toEqual({
      big: '2', small: 'day', monthDay: null, name: 'Day 2',
    })
  })

  it('treats a malformed date as no date rather than printing "Invalid Date"', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', 'soon']) {
      expect(dayLabel({ day_number: 4, day_date: bad })).toEqual({
        big: '4', small: 'day', monthDay: null, name: 'Day 4',
      })
    }
  })
})
