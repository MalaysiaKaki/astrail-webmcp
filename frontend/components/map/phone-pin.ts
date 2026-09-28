import type { PlaceType } from '@/lib/trip/backend-types'

/**
 * The phone's trail pin (Placify pattern): a circular avatar — the Reel still behind the stop, or
 * a category glyph when there is none — in a white ring with a soft shadow, the trail number as a
 * badge, and, when selected, a larger avatar with the stop's name in a pill beside it.
 *
 * Built as plain DOM for a Mapbox marker, like the desktop teardrop in TripMap. Styles live in
 * ./phone-pins.css, scoped to phones. The ROOT is 48x48 so the tap target clears the phone floor
 * even though the avatar draws smaller; it grows with width/height, never a transform (Mapbox
 * owns the root's transform — see marker-css-contract.test.ts).
 *
 * Every string goes in through textContent: place names come from Reel captions (untrusted).
 * `photoUrl` must already have passed the caller's safe-URL gate.
 */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** One stroked 24px path per place type. Categories, not photographs: a glyph claims nothing. */
export const PHONE_PIN_GLYPHS: Record<PlaceType, string> = {
  restaurant: 'M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 10v11M16 3c-1.7 0-3 2-3 5s1.3 4 3 4v9',
  station: 'M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM5 10h14M8 21l1.5-4M16 21l-1.5-4',
  attraction: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z',
  hotel: 'M3 19V7M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  shop: 'M5 8h14l-1 12H6ZM9 8V6a3 3 0 0 1 6 0v2',
  area: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11ZM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z',
  city: 'M4 21V9l5-3v15M9 21V4l6 3v14M15 21v-9l5 2v7M3 21h18',
  country: 'M4 21V4M4 4h12l-2 4 2 4H4',
  other: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11ZM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z',
}

function glyph(placeType: PlaceType): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'phone-pin__glyph')
  svg.setAttribute('data-glyph', placeType)
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', PHONE_PIN_GLYPHS[placeType] ?? PHONE_PIN_GLYPHS.other)
  svg.append(path)
  return svg
}

export function buildPhonePin({ name, label, placeType, sourceType, number, selected, photoUrl }: {
  /** Full place name: the button's accessible name and the pill's title. */
  name: string
  /** What the pill shows (shortened for the map). */
  label: string
  placeType: PlaceType
  /** reel_extracted | user_requested | agent_suggested, as a modifier class. */
  sourceType: string
  /** The shared trail number, or null for a stop that is not on the numbered trail. */
  number: number | null
  selected: boolean
  photoUrl: string | null
}): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', name)
  el.className = [
    'phone-pin',
    `phone-pin--${sourceType}`,
    number === null ? 'phone-pin--receding' : '',
    selected ? 'phone-pin--selected' : '',
  ].filter(Boolean).join(' ')

  const avatar = document.createElement('span')
  avatar.className = 'phone-pin__avatar'
  if (photoUrl) {
    const img = document.createElement('img')
    img.className = 'phone-pin__photo'
    img.src = photoUrl
    img.alt = ''
    img.decoding = 'async'
    // A dead Instagram CDN link falls back to the glyph, never a hole in the pin.
    img.addEventListener('error', () => { img.replaceWith(glyph(placeType)) })
    avatar.append(img)
  } else {
    avatar.append(glyph(placeType))
  }
  el.append(avatar)

  // The number is not decoration: the agent's tools address stops by it ("move stop 7").
  if (number !== null) {
    const badge = document.createElement('span')
    badge.className = 'phone-pin__badge'
    badge.textContent = String(number)
    el.append(badge)
  }

  if (selected) {
    const pill = document.createElement('span')
    pill.className = 'phone-pin__name'
    pill.textContent = label
    pill.title = name
    pill.setAttribute('aria-hidden', 'true')
    el.append(pill)
  }
  return el
}
