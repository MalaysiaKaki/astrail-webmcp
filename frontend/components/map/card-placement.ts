/**
 * Where the desktop place card opens around its pin (A10; Codex map-card review §2).
 *
 * Pure geometry in map-container pixels. Mapbox's own Popup auto-anchoring checks only the
 * container's edges; the floating panel, the control stack, the agent dock and the day chip all sit
 * INSIDE the container, so the card is placed here against their measured rects instead.
 *
 * Three answers:
 *   fit    an anchor and the tallest card that fits there (the card body scrolls past it)
 *   shift  no anchor fits where the pin is now: moving the pin by (dx, dy) would make one fit. The
 *          caller spends this once per opening, as one bounded camera correction.
 *   none   nothing fits even after a bounded shift (a narrow map, a short viewport, a pin behind
 *          the camera): the detail belongs in the sidebar. A camera move cannot manufacture width.
 */

/** Mapbox Popup anchors: the name is the side of the CARD that touches the pin. */
export type CardAnchor =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type Box = { x: number; y: number; w: number; h: number }

export type PlacementInput = {
  /** The pin in map-container px (map.project), or null when it could not be projected. */
  pin: { x: number; y: number } | null
  /** The card's outer width, and its natural outer height (header + whole body + pointer). */
  card: { w: number; natural: number }
  view: { w: number; h: number }
  /** Chrome the card must not cover, in map-container px. */
  obstacles: readonly Box[]
  /** Pin centre to the card's near edge (the avatar's radius plus the pointer). */
  offset: number
  /** Clearance kept from the view edges and every obstacle. */
  margin: number
  /** Below this the card is not usable (header, the evidence, the actions). */
  minHeight: number
  /** The anchor in use now; kept while it still fits the whole card, so a moving map never flips. */
  current?: CardAnchor | null
  /** The floating panel's right edge (0 when collapsed): the map starts there. */
  panelRight?: number
}

export type Placement =
  | { kind: 'fit'; anchor: CardAnchor; rect: Box; maxHeight: number }
  | { kind: 'shift'; dx: number; dy: number }
  | { kind: 'none' }

/** Below the pin first (the camera frames a selection in the upper third), then above, then beside. */
const ORDER: readonly CardAnchor[] = ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

/** Grid step and the furthest a correction may move the pin, as a share of the larger side. */
const SHIFT_STEP = 24
const SHIFT_REACH = 0.5
/** A card anchored after a shift should be comfortably tall, not merely usable. */
const SHIFT_TARGET = 0.55
/** Map that must stay visible beside a card: a card that covers what the panel left is a sidebar. */
export const MIN_MAP_BESIDE_CARD = 160
/** Mapbox reports a point behind the camera as Number.MAX_VALUE. */
const MAX_COORD = 1e7

/** The card's rect for an anchor, with Mapbox's diagonal offset for the corner anchors. */
export function anchorRect(anchor: CardAnchor, pin: { x: number; y: number }, w: number, h: number, offset: number): Box {
  const d = Math.round(Math.sqrt(0.5 * offset * offset))
  switch (anchor) {
    case 'top': return { x: pin.x - w / 2, y: pin.y + offset, w, h }
    case 'bottom': return { x: pin.x - w / 2, y: pin.y - offset - h, w, h }
    case 'left': return { x: pin.x + offset, y: pin.y - h / 2, w, h }
    case 'right': return { x: pin.x - offset - w, y: pin.y - h / 2, w, h }
    case 'top-left': return { x: pin.x + d, y: pin.y + d, w, h }
    case 'top-right': return { x: pin.x - d - w, y: pin.y + d, w, h }
    case 'bottom-left': return { x: pin.x + d, y: pin.y - d - h, w, h }
    case 'bottom-right': return { x: pin.x - d - w, y: pin.y - d - h, w, h }
  }
}

function overlaps(a: Box, b: Box, pad: number): boolean {
  return a.x < b.x + b.w + pad && b.x - pad < a.x + a.w && a.y < b.y + b.h + pad && b.y - pad < a.y + a.h
}

function clear(r: Box, s: PlacementInput): boolean {
  const m = s.margin
  if (r.x < m || r.y < m || r.x + r.w > s.view.w - m || r.y + r.h > s.view.h - m) return false
  return s.obstacles.every((o) => o.w <= 0 || o.h <= 0 || !overlaps(r, o, m))
}

/** The pin itself must be visible: not under the panel or a control, not off the map. */
function pinClear(pin: { x: number; y: number }, s: PlacementInput): boolean {
  const r = Math.round(s.offset * 0.6)
  const box = { x: pin.x - r, y: pin.y - r, w: 2 * r, h: 2 * r }
  if (box.x < 0 || box.y < 0 || box.x + box.w > s.view.w || box.y + box.h > s.view.h) return false
  return s.obstacles.every((o) => o.w <= 0 || o.h <= 0 || !overlaps(box, o, 0))
}

/**
 * The tallest height in [min, natural] at which `anchor` is clear, or 0. Monotone: with the pin-side
 * edge fixed (or the card centred on it), a shorter card is a sub-rectangle of a taller one.
 */
function tallest(anchor: CardAnchor, pin: { x: number; y: number }, s: PlacementInput, min: number): number {
  const hi = Math.round(s.card.natural)
  const fits = (h: number) => clear(anchorRect(anchor, pin, s.card.w, h, s.offset), s)
  if (hi < min) return fits(hi) ? hi : 0
  if (fits(hi)) return hi
  if (!fits(min)) return 0
  let lo = min
  let top = hi
  while (top - lo > 1) {
    const mid = (lo + top) >> 1
    if (fits(mid)) lo = mid
    else top = mid
  }
  return lo
}

function best(pin: { x: number; y: number }, s: PlacementInput, min: number): { anchor: CardAnchor; h: number } | null {
  const natural = Math.round(s.card.natural)
  const order = s.current ? [s.current, ...ORDER.filter((a) => a !== s.current)] : ORDER
  let partial: { anchor: CardAnchor; h: number } | null = null
  for (const anchor of order) {
    const h = tallest(anchor, pin, s, min)
    if (h >= natural) return { anchor, h }          // the whole card: the first one wins
    if (h > 0 && (!partial || h > partial.h)) partial = { anchor, h }
  }
  return partial
}

function usable(pin: { x: number; y: number } | null): pin is { x: number; y: number } {
  return !!pin && Number.isFinite(pin.x) && Number.isFinite(pin.y) && Math.abs(pin.x) < MAX_COORD && Math.abs(pin.y) < MAX_COORD
}

/** Grid offsets within reach, nearest first. */
function shifts(view: { w: number; h: number }): Array<[number, number]> {
  const reach = Math.max(view.w, view.h) * SHIFT_REACH
  const n = Math.floor(reach / SHIFT_STEP)
  const out: Array<[number, number]> = []
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const dx = i * SHIFT_STEP
      const dy = j * SHIFT_STEP
      if ((dx || dy) && Math.hypot(dx, dy) <= reach) out.push([dx, dy])
    }
  }
  return out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
}

/**
 * Whether the map right of the panel can ever hold the card and still show map: a question about
 * the viewport alone, answerable before any camera move (the sidebar gets the detail at once).
 */
export function mapHasCardRoom(viewW: number, panelRight: number, cardW: number): boolean {
  return viewW - panelRight >= cardW + MIN_MAP_BESIDE_CARD
}

export function solveCardPlacement(s: PlacementInput): Placement {
  if (!usable(s.pin) || s.card.w <= 0 || s.card.natural <= 0) return { kind: 'none' }
  // Measured capacity, not a breakpoint: the map right of the panel must hold the card AND still
  // show some map. At 768 with the panel open it does not, whatever the camera does.
  if (!mapHasCardRoom(s.view.w, s.panelRight ?? 0, s.card.w)) return { kind: 'none' }
  const pin = s.pin
  if (pinClear(pin, s)) {
    const here = best(pin, s, s.minHeight)
    if (here) return { kind: 'fit', anchor: here.anchor, rect: anchorRect(here.anchor, pin, s.card.w, here.h, s.offset), maxHeight: here.h }
  }
  const target = Math.min(Math.round(s.card.natural), Math.max(s.minHeight, Math.round(s.view.h * SHIFT_TARGET)))
  for (const [dx, dy] of shifts(s.view)) {
    const moved = { x: pin.x + dx, y: pin.y + dy }
    if (pinClear(moved, s) && best(moved, { ...s, current: null }, target)) return { kind: 'shift', dx, dy }
  }
  return { kind: 'none' }
}
