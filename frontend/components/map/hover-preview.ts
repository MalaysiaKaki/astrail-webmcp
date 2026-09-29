/**
 * The desktop pin hover preview (plan v2, Map and pins): a light card over a pin under a pointer —
 * cover, name, "Stop N · Day D" and "Click to open". It is a preview only; a click selects the
 * stop's card in the panel as before, and no popup opens on click.
 *
 * Built as plain DOM for a Mapbox popup. Every string goes in through textContent (place names
 * come from Reel captions); the cover must already have passed the caller's safe-URL gate.
 */
export function buildHoverCard({ name, cover, stop, day }: {
  name: string
  cover: string | null
  stop: number | null
  day: number | null
}): HTMLElement {
  const root = document.createElement('div')
  root.className = 'pin-hover'
  if (cover) {
    const img = document.createElement('img')
    img.className = 'pin-hover__cover'
    img.src = cover
    img.alt = ''
    img.decoding = 'async'
    img.addEventListener('error', () => img.remove())
    root.append(img)
  }
  const text = document.createElement('div')
  text.className = 'pin-hover__text'
  const title = document.createElement('p')
  title.className = 'pin-hover__name'
  title.textContent = name
  const meta = document.createElement('p')
  meta.className = 'pin-hover__meta'
  meta.textContent = [stop === null ? 'Place' : `Stop ${stop}`, day === null ? 'No day' : `Day ${day}`].join(' · ')
  const hint = document.createElement('p')
  hint.className = 'pin-hover__hint'
  hint.textContent = 'Click to open'
  text.append(title, meta, hint)
  root.append(text)
  return root
}

/** Pointer devices only: a touch screen has no hover, and a tap must stay a plain select. */
export function canHover(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

type PopupLike = {
  setLngLat: (at: [number, number]) => PopupLike
  setDOMContent: (el: HTMLElement) => PopupLike
  addTo: (map: never) => PopupLike
  remove: () => unknown
}

/**
 * One hover card at a time. TripMap hides it on marker replacement, selection, a layout change,
 * an eat or stay popup opening, and unmount; it is never shown while one of those popups is open.
 */
export function createHoverPreview(makePopup: () => PopupLike) {
  let open: PopupLike | null = null
  const hide = () => { open?.remove(); open = null }
  return {
    show(map: unknown, at: [number, number], content: HTMLElement) {
      hide()
      open = makePopup().setLngLat(at).setDOMContent(content).addTo(map as never)
    },
    hide,
  }
}
