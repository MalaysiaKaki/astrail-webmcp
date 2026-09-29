import type { TripPlace } from '@/lib/trip/backend-types'
import { LABEL_MIN_ZOOM, placePinLabels, type LabelCandidate, type Rect } from './pin-labels'

/**
 * The desktop pin reconcile step (plan v2 amendments 6, 7 and 10).
 *
 * Runs over the markers drawMarkers already built, and never rebuilds them or moves the camera:
 *
 *   - Pins on other days dim (`phone-pin--dimmed`); they stay clickable.
 *   - At zoom >= 11 each active-day pin gets its name pill, placed by pin-labels (right, flipped
 *     left, or suppressed). The selected pin's own pill (drawn by buildPhonePin) takes part and
 *     always wins an overlap.
 *   - On a phone (or when `desktop` is false after a rotation) every desktop-only change is undone:
 *     no dimming, no added pills, the selected pill back on its right. Phone pins are unchanged.
 */
export type PinEntry = {
  el: HTMLElement
  tp: TripPlace
  lngLat: [number, number]
  /** What the pill shows (shortened). */
  label: string
}

export type ReconcileInput = {
  activeDay: number
  selectedPlaceId: string | null
  desktop: boolean
  zoom: number
  /** Map-container pixels for a coordinate (map.project). */
  project: (lngLat: [number, number]) => { x: number; y: number }
  width: number
  height: number
  /** Controls and the expanded panel, in map-container pixels. */
  obstacles: readonly Rect[]
  /** The desktop place card is open on the selected pin: its title names the place (A10). */
  hideSelected?: boolean
}

const ADDED = 'reconciled'
const PILL = 'phone-pin__name'
const LEFT = 'phone-pin__name--left'
const DIMMED = 'phone-pin--dimmed'

function pillOf(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>(`.${PILL}`)
}

function ensurePill(entry: PinEntry): HTMLElement {
  const existing = pillOf(entry.el)
  if (existing) return existing
  const pill = document.createElement('span')
  pill.className = PILL
  pill.dataset.origin = ADDED
  pill.textContent = entry.label
  pill.title = entry.tp.place.name
  pill.setAttribute('aria-hidden', 'true')
  entry.el.append(pill)
  return pill
}

/** A pill's width before layout (jsdom, or a pill created this frame): a generous estimate. */
const estimate = (label: string) => Math.ceil(label.length * 7.6 + 24)

export function reconcilePins(entries: readonly PinEntry[], input: ReconcileInput): void {
  const { desktop, activeDay, selectedPlaceId, zoom } = input
  const wanted: { entry: PinEntry; pill: HTMLElement; selected: boolean }[] = []
  for (const entry of entries) {
    const selected = entry.tp.place_id === selectedPlaceId
    entry.el.classList.toggle(DIMMED, desktop && !selected && entry.tp.day_number !== activeDay)
    const wantsPill = desktop && (selected || (entry.tp.day_number === activeDay && zoom >= LABEL_MIN_ZOOM))
    const pill = pillOf(entry.el)
    if (wantsPill && selected && input.hideSelected) {
      if (pill) pill.hidden = true
      continue
    }
    if (!wantsPill) {
      // Undo: an added pill goes; the selected pin's own pill returns to its phone placement.
      if (pill?.dataset.origin === ADDED) pill.remove()
      else if (pill) { pill.hidden = false; pill.classList.remove(LEFT) }
      continue
    }
    const p = ensurePill(entry)
    // Shown before measuring: a pill hidden last time measures 0 wide, and an estimate can
    // undershoot the real text (wide glyphs, CJK) and let a pill run off the edge.
    p.hidden = false
    p.classList.remove(LEFT)
    wanted.push({ entry, pill: p, selected })
  }
  // Every read after every write: one layout, not one per pin. Nothing paints in between.
  const candidates = wanted.map(({ entry, pill, selected }) => {
    const at = input.project(entry.lngLat)
    const width = pill.offsetWidth || estimate(pill.textContent ?? entry.label)
    const radius = (entry.el.offsetWidth || (selected ? 56 : 48)) / 2
    return { pill, c: { id: entry.tp.id, x: at.x, y: at.y, radius, width, selected } satisfies LabelCandidate }
  })
  const sides = placePinLabels(candidates.map((x) => x.c), { width: input.width, height: input.height, obstacles: input.obstacles })
  for (const { pill, c } of candidates) {
    const side = sides[c.id]
    pill.hidden = side === 'hidden'
    pill.classList.toggle(LEFT, side === 'left')
  }
}

type ReconcileMap = {
  getZoom?: () => number
  project?: (at: [number, number]) => { x: number; y: number }
  getCanvas?: () => { clientWidth: number; clientHeight: number } | null
  getContainer?: () => { getBoundingClientRect?: () => { left: number; top: number } } | null
}

/**
 * reconcilePins against a live map: the zoom, the projection, the canvas size, and the obstacles a
 * pill must clear — the controls (measured in viewport px, moved into map-container px) and the
 * expanded panel (its right edge, 0 when collapsed).
 */
export function reconcileOnMap(
  map: unknown,
  entries: readonly PinEntry[],
  s: {
    activeDay: number; selectedPlaceId: string | null; desktop: boolean; controls: readonly Rect[]; panelRight: number
    /** Already in map-container px: the open place card, a local obstacle for the other pills. */
    card?: Rect | null
    hideSelected?: boolean
  },
): void {
  const m = map as ReconcileMap
  const canvas = typeof m.getCanvas === 'function' ? m.getCanvas() : null
  const container = typeof m.getContainer === 'function' ? m.getContainer() : null
  const origin = typeof container?.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null
  const left = origin?.left ?? 0
  const top = origin?.top ?? 0
  const height = canvas?.clientHeight ?? window.innerHeight
  reconcilePins(entries, {
    activeDay: s.activeDay,
    selectedPlaceId: s.selectedPlaceId,
    desktop: s.desktop,
    zoom: typeof m.getZoom === 'function' ? m.getZoom() : 0,
    project: (at) => (typeof m.project === 'function' ? m.project(at) : { x: 0, y: 0 }),
    width: canvas?.clientWidth ?? window.innerWidth,
    height,
    hideSelected: s.hideSelected,
    obstacles: [
      ...(s.card ? [s.card] : []),
      ...s.controls.map((r) => ({ ...r, x: r.x - left, y: r.y - top })),
      ...(s.panelRight > 0 ? [{ x: 0, y: 0, w: s.panelRight - left, h: height }] : []),
    ],
  })
}
