import { describe, it, expect } from 'vitest'
import { weatherChip } from '../weather-chip'

const day = (weather_payload: Record<string, unknown>, weather_summary: string | null = null) =>
  ({ weather_payload, weather_summary })

describe('weatherChip (amendment 9)', () => {
  it('reads the backend shape: range, millimetres, and the icon from the WMO code', () => {
    expect(weatherChip(day({ temp_min_c: 24, temp_max_c: 31, precipitation_mm: 3.2, weather_code: 61 }, 'Rain, 24-31°C')))
      .toEqual({ icon: 'rain', text: '24–31°C · 3.2 mm', label: 'Rain, 24-31°C' })
  })

  it('reads the fixture shape: one temperature and a percent chance', () => {
    expect(weatherChip(day({ temperatureC: 31, precipitationChance: 55 }, 'Warm, 31°C, afternoon showers likely.')))
      .toEqual({ icon: null, text: '31°C · 55% rain', label: 'Warm, 31°C, afternoon showers likely.' })
  })

  it('code 0 is clear, not missing', () => {
    expect(weatherChip(day({ temp_min_c: 20, temp_max_c: 26, precipitation_mm: 0, weather_code: 0 }))!.icon).toBe('clear')
  })

  it('a missing or unknown code draws no icon, even with heavy rain or heat', () => {
    expect(weatherChip(day({ temp_min_c: 35, temp_max_c: 40, precipitation_mm: 40 }))!.icon).toBeNull()
    expect(weatherChip(day({ temperatureC: 38, precipitationChance: 95 }))!.icon).toBeNull()
    expect(weatherChip(day({ weather_code: 1234, temperatureC: 20 }))!.icon).toBeNull()
    expect(weatherChip(day({ weather_code: '61', temperatureC: 20 }))!.icon).toBeNull()
  })

  it('0 mm is shown as 0 mm, not dropped', () => {
    expect(weatherChip(day({ temp_min_c: 20, temp_max_c: 26, precipitation_mm: 0, weather_code: 2 }))!.text).toBe('20–26°C · 0 mm')
  })

  it('falls back to the summary text when the payload has nothing usable', () => {
    expect(weatherChip(day({}, 'Mild and dry'))).toEqual({ icon: null, text: 'Mild and dry', label: 'Mild and dry' })
  })

  it('an empty payload with a null summary shows no chip', () => {
    expect(weatherChip(day({}, null))).toBeNull()
    expect(weatherChip(day({}, '   '))).toBeNull()
  })

  it('a code alone gives an icon and the code\'s own label', () => {
    expect(weatherChip(day({ weather_code: 95 }))).toEqual({ icon: 'storm', text: 'Thunderstorm', label: 'Thunderstorm' })
  })

  it('ignores non-finite numbers', () => {
    // The finite max still stands on its own; the NaN min and the infinite rain are dropped.
    expect(weatherChip(day({ temp_min_c: Number.NaN, temp_max_c: 30, precipitation_mm: Infinity }, 'Hot'))).toEqual({ icon: null, text: '30°C', label: 'Hot' })
    expect(weatherChip(day({ temp_min_c: Number.NaN, precipitation_mm: Infinity }, 'Hot'))).toEqual({ icon: null, text: 'Hot', label: 'Hot' })
  })
})
