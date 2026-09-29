import { describe, it, expect } from 'vitest'
import { buildPhonePin, PHONE_PIN_GLYPHS } from '@/components/map/phone-pin'
import type { PlaceType } from '@/lib/trip/backend-types'

const base = {
  name: 'Harry Potter Cafe', label: 'Harry Potter Cafe', placeType: 'restaurant' as PlaceType,
  sourceType: 'reel_extracted', number: 2, selected: false,
}

describe('buildPhonePin', () => {
  it('is a 44px-hit button named for the place, with a circular photo avatar and a number badge', () => {
    const el = buildPhonePin({ ...base, photoUrl: 'https://cdn.example.com/a.jpg' })
    expect(el.tagName).toBe('BUTTON')
    expect(el.type).toBe('button')
    expect(el.getAttribute('aria-label')).toBe('Harry Potter Cafe')
    expect(el.className).toBe('phone-pin phone-pin--reel_extracted')
    const img = el.querySelector('.phone-pin__avatar img.phone-pin__photo')!
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.jpg')
    expect(img.getAttribute('alt')).toBe('')
    expect(el.querySelector('.phone-pin__badge')!.textContent).toBe('2')
    expect(el.querySelector('.phone-pin__name')).toBeNull()        // unselected: no pill
  })

  it('draws the category glyph, never a borrowed photo, when there is no Reel still', () => {
    const el = buildPhonePin({ ...base, photoUrl: null, placeType: 'station' })
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('.phone-pin__glyph')!.getAttribute('data-glyph')).toBe('station')
  })

  it('has a glyph for every place type', () => {
    const types: PlaceType[] = ['attraction', 'restaurant', 'hotel', 'area', 'city', 'country', 'station', 'shop', 'other']
    for (const t of types) expect(PHONE_PIN_GLYPHS[t]).toBeTruthy()
  })

  it('falls back to the glyph when the photo fails to load', () => {
    const el = buildPhonePin({ ...base, photoUrl: 'https://cdn.example.com/dead.jpg' })
    el.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('.phone-pin__glyph')).not.toBeNull()
    expect(el.querySelector('.phone-pin__badge')!.textContent).toBe('2')   // the number survives
  })

  it('grows and shows its name pill when selected', () => {
    const el = buildPhonePin({ ...base, photoUrl: null, selected: true, label: 'Harry Potter…' })
    expect(el.className).toContain('phone-pin--selected')
    const pill = el.querySelector('.phone-pin__name')!
    expect(pill.textContent).toBe('Harry Potter…')
    expect(pill.getAttribute('title')).toBe('Harry Potter Cafe')
    expect(pill.getAttribute('aria-hidden')).toBe('true')          // the button already has the name
  })

  it('recedes, unbadged, when the stop has no trail number', () => {
    const el = buildPhonePin({ ...base, photoUrl: null, number: null })
    expect(el.className).toContain('phone-pin--receding')
    expect(el.querySelector('.phone-pin__badge')).toBeNull()
  })

  it('writes every string through textContent, so a hostile name stays text', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const el = buildPhonePin({ ...base, name: evil, label: evil, photoUrl: null, selected: true })
    expect(el.querySelector('.phone-pin__name img')).toBeNull()
    expect(el.querySelector('.phone-pin__name')!.textContent).toBe(evil)
  })
})

/* A10 item 1: the trip map is exposed to assistive tech now, and Mapbox's Marker sets role="img"
   on any element without a role, which hid every pin's button semantics. Pins say they are buttons. */
describe('map pins keep their button role under a Mapbox Marker', () => {
  it('a stop pin and an eat pin carry role="button" explicitly', async () => {
    const { buildEatPin } = await import('@/components/map/trail-features')
    const { TOKYO_TRIP } = await import('@/lib/trip/fixtures')
    const pin = buildPhonePin({ name: 'A', label: 'A', placeType: 'restaurant', sourceType: 'reel_extracted', number: 1, selected: false, photoUrl: null })
    expect(pin.getAttribute('role')).toBe('button')
    const r = TOKYO_TRIP.restaurants[0]
    const place = TOKYO_TRIP.suggestion_places.find((p) => p.id === r.restaurant_place_id)!
    expect(buildEatPin(r, place, false).el.getAttribute('role')).toBe('button')
  })
})
