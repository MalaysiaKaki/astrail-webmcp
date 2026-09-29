/**
 * Where each active-day pin's name pill goes on the desktop map (plan v2 amendments 7 and 10).
 *
 * Pure geometry, in map-container pixels. A pill sits to the pin's right (Placify's reading
 * order). It flips to the left when the right side would cross the viewport edge or a control,
 * and is suppressed when neither side fits: the left side must also clear the viewport edge and
 * the expanded panel, which arrives here as an obstacle rect. Then collisions: the selected pill
 * is placed first and always wins; each other pill, in trail order, is suppressed if it would
 * overlap one already placed. Hover still shows a suppressed pin's full name.
 */

/** Name pills only from this zoom up: below it the pins are too close for names to read. */
export const LABEL_MIN_ZOOM = 11
/** The pill's height (phone-pins.css `.phone-pin__name`). */
export const LABEL_HEIGHT = 28
/** The pill overlaps its avatar by this much, as the CSS draws it. */
const TUCK = 4
/** Minimum clearance from the viewport's left and right edges. */
const EDGE = 8

export type LabelCandidate = {
  id: string
  /** The pin's centre. */
  x: number
  y: number
  /** Half the pin root's width: where the pill starts. */
  radius: number
  /** The pill's measured width. */
  width: number
  selected: boolean
}

export type Rect = { x: number; y: number; w: number; h: number }
export type LabelSide = 'right' | 'left' | 'hidden'

type Box = { left: number; right: number; top: number; bottom: number }

function box(c: LabelCandidate, side: 'right' | 'left'): Box {
  const top = c.y - LABEL_HEIGHT / 2
  const bottom = top + LABEL_HEIGHT
  return side === 'right'
    ? { left: c.x + c.radius - TUCK, right: c.x + c.radius - TUCK + c.width, top, bottom }
    : { left: c.x - c.radius + TUCK - c.width, right: c.x - c.radius + TUCK, top, bottom }
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const hitsRect = (a: Box, r: Rect) => overlaps(a, { left: r.x, right: r.x + r.w, top: r.y, bottom: r.y + r.h })

export function placePinLabels(
  candidates: readonly LabelCandidate[],
  view: { width: number; height: number; obstacles: readonly Rect[] },
): Record<string, LabelSide> {
  const fits = (b: Box) => b.left >= EDGE && b.right <= view.width - EDGE
    && b.top >= 0 && b.bottom <= view.height
    && !view.obstacles.some((o) => hitsRect(b, o))
  const order = [...candidates.filter((c) => c.selected), ...candidates.filter((c) => !c.selected)]
  const placed: Box[] = []
  const out: Record<string, LabelSide> = {}
  for (const c of order) {
    const side = (['right', 'left'] as const).find((s) => fits(box(c, s))) ?? null
    if (!side) { out[c.id] = 'hidden'; continue }
    const b = box(c, side)
    if (!c.selected && placed.some((p) => overlaps(p, b))) { out[c.id] = 'hidden'; continue }
    placed.push(b)
    out[c.id] = side
  }
  return out
}
