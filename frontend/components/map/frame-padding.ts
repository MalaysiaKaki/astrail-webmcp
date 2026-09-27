/**
 * Camera padding for framing a trip's pins around the chrome that covers the map.
 *
 * Pure, so the geometry is testable without a Mapbox instance. TripMap measures the canvas and
 * reads the sheet obstruction; this decides the pads.
 *
 * Desktop (canvas >= 768px) is unchanged: clear the 440px left panel. On a phone the bottom pad is
 * the mobile sheet's REAL covered height (lib/trip/sheet-obstruction), not the fixed 42% the old
 * sheet assumed — that value ignored the sheet's actual height and its hidden state, so a pin
 * selected with the sheet at 82% was framed for 42% and landed under it.
 *
 * Measured against the CANVAS, not the window. An earlier version derived the bottom padding from
 * window.innerHeight, which on a phone asked for more padding than the canvas had. Mapbox then logs
 * "Map cannot fit within canvas with the given bounds, padding, and/or offset" and REFUSES TO MOVE.
 * Hence the 70% cap below.
 */

export type FramePadding = { top: number; right: number; bottom: number; left: number }

/** Room for the floating top bar (back, title pill, layer toggle) plus a breath. */
export const MOBILE_TOP_CLEARANCE = 88
/** Space kept above the sheet edge: the agent chip sits there, so pins must clear it. */
export const MOBILE_SHEET_GAP = 64
/** Bottom pad with no sheet at all: the reopen pill and the home indicator. */
const MOBILE_BARE_BOTTOM = 72
const MOBILE_SIDE = 48

const DESKTOP_BREAKPOINT = 768

export function computeFramePadding({ width, height, obstruction, popupRoom = false }: {
  width: number
  height: number
  /** Pixels the mobile sheet covers at the bottom; 0 when hidden or absent. */
  obstruction: number
  /** Bias the pin into the upper third so an evidence popup has somewhere to open (desktop). */
  popupRoom?: boolean
}): FramePadding {
  const wide = width >= DESKTOP_BREAKPOINT
  const wanted = wide
    ? { top: 80, right: 80, bottom: 80, left: 480 }
    : {
        top: MOBILE_TOP_CLEARANCE,
        right: MOBILE_SIDE,
        bottom: obstruction > 0 ? obstruction + MOBILE_SHEET_GAP : MOBILE_BARE_BOTTOM,
        left: MOBILE_SIDE,
      }

  // Solving `0.3H = top + (H - top - bottom)/2` for bottom. Only desktop needs it: on a phone the
  // sheet pad already pushes the pin well above centre. Applied BEFORE the cap, so an extreme
  // viewport degrades to "framed tight" rather than an abandoned camera.
  if (popupRoom && wide) wanted.bottom = wanted.top + Math.round(height * 0.4)

  const [top, bottom] = fitAxis(wanted.top, wanted.bottom, height)
  const [left, right] = fitAxis(wanted.left, wanted.right, width)
  return { top, right, bottom, left }
}

// Never let opposing pads consume the canvas: Mapbox abandons the fit entirely rather than doing
// its best. Cap each axis at 70% and shrink proportionally — "framed a bit tight", not "not framed".
function fitAxis(a: number, b: number, extent: number): readonly [number, number] {
  const budget = extent * 0.7
  const total = a + b
  if (total <= budget || total === 0) return [a, b]
  const scale = budget / total
  return [Math.floor(a * scale), Math.floor(b * scale)]
}
