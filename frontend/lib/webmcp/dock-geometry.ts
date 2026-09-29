import { DOCK_CHIP_GAP, DOCK_CHIP_HEIGHT } from '@/lib/trip/sheet-obstruction'

/**
 * Where the agent dock sits above the phone bottom tab bar (plan amendment 6).
 *
 * `nav` is lib/shell/bottom-nav's value: the whole strip from the bar's top edge to the viewport
 * bottom, safe area and float gap INCLUDED — so nothing here adds env(safe-area-inset-bottom)
 * again. 0 means no bar (>=768px, trip routes, before the bar measures), and both functions then
 * return null: the dock and the approval card keep their own usual positions.
 */

/** The folded chip's bottom edge, in px above the viewport bottom: one gap above the bar. */
export function dockBottomOverNav(nav: number): number | null {
  return nav > 0 ? nav + DOCK_CHIP_GAP : null
}

/**
 * An approval card's bottom edge: above the bar AND the folded chip riding it, so the one
 * decision on screen is never under either.
 */
export function approvalBottomOverNav(nav: number): number | null {
  return nav > 0 ? nav + DOCK_CHIP_GAP + DOCK_CHIP_HEIGHT + DOCK_CHIP_GAP : null
}

/**
 * Desktop: the height the dock column may use under the map's right-hand control stack (zoom,
 * 3D, Fit, Hotel), from the controls' MEASURED rects (lib/trip/control-obstruction). The dock is
 * bottom-anchored in the same corner column, so a tall stack of panels grew up over those buttons
 * at 1024x768. Only rects in the right half count (the back button and panel are on the left).
 * Null when nothing is measured there: the dock keeps its full viewport.
 */
export function dockRoomUnderControls(
  rects: readonly { x: number; y: number; w: number; h: number }[],
  viewportWidth: number,
  viewportHeight: number,
  gap = 16,
): number | null {
  const right = rects.filter((r) => r.x + r.w / 2 > viewportWidth / 2)
  if (right.length === 0) return null
  const stackBottom = Math.max(...right.map((r) => r.y + r.h))
  return Math.max(0, Math.round(viewportHeight - stackBottom - gap))
}
