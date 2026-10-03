/**
 * Camera padding for framing a trip's pins around the chrome that covers the map.
 *
 * Pure, so the geometry is testable without a Mapbox instance. TripMap measures the canvas and
 * reads the sheet obstruction; this decides the pads.
 *
 * Desktop (canvas >= 768px) clears the floating panel's MEASURED right edge (lib/trip/panel-
 * obstruction; 0 when collapsed) plus a gap. On a phone the bottom pad is
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
export type Rect = { x: number; y: number; w: number; h: number }

/* The phone map chrome (MobileMapControls): a back button top-left and a vertical stack of up to
   four circular buttons top-right (agent, Fit, 3D, Hotel). Kept here, beside the pads derived from
   it, so the "no pin under a control" property is one test away from any change to either. The
   live camera pads against the MEASURED rects (lib/trip/control-obstruction); this model is the
   fallback before anything has measured, and the shape the tests hold the measured path to. */
/** Distance of every map control from the viewport's top and side edges. */
export const MOBILE_CONTROL_INSET = 12
/** Every map control is a 44px circle. */
export const MOBILE_CONTROL_SIZE = 44
/** Vertical gap between buttons in the right-hand stack. */
export const MOBILE_STACK_GAP = 8
/** Agent, Fit, 3D, Hotel. */
export const MAX_STACK_BUTTONS = 4
/** Half of a drawn pin (the dot and its ring): the framed POINT is its centre. */
export const PIN_RADIUS = 18

const CONTROL_EDGE = MOBILE_CONTROL_INSET + MOBILE_CONTROL_SIZE
/** Below the top row of controls (back, first stack button), pin radius included. */
export const MOBILE_TOP_CLEARANCE = CONTROL_EDGE + PIN_RADIUS + 2
/** Left of the right-hand stack column, pin radius included; the stack is taller than the top pad. */
export const MOBILE_RIGHT_CLEARANCE = CONTROL_EDGE + PIN_RADIUS + 2
/** Space kept above the sheet edge for the pin itself and its name pill. */
export const MOBILE_SHEET_GAP = 40
/** Bottom pad with no sheet at all: the reopen pill and the home indicator. */
const MOBILE_BARE_BOTTOM = 72
const MOBILE_LEFT = 48

/**
 * The top of the phone map controls: `max(12px, env(safe-area-inset-top))`, exactly as
 * MobileMapControls positions them. With viewport-fit=cover a notched phone reports ~47px, and a
 * camera padded for 12px framed pins under the back button (Codex final review #2).
 */
export function controlsTop(safeTop = 0): number {
  return Math.max(MOBILE_CONTROL_INSET, Number.isFinite(safeTop) ? safeTop : 0)
}

/** The phone map controls' rects in canvas pixels: the back button, then each stack button. */
export function mobileControlRects(width: number, stackButtons: number, safeTop = 0): Rect[] {
  const size = MOBILE_CONTROL_SIZE
  const top = controlsTop(safeTop)
  const back: Rect = { x: MOBILE_CONTROL_INSET, y: top, w: size, h: size }
  const stack = Array.from({ length: stackButtons }, (_, i): Rect => ({
    x: width - MOBILE_CONTROL_INSET - size,
    y: top + i * (size + MOBILE_STACK_GAP),
    w: size,
    h: size,
  }))
  return [back, ...stack]
}

/** Room kept between the lowest stack button and the compact sheet's top edge. */
export const STACK_SHEET_GAP = 12

/**
 * Whether a phone stack of `buttons` circles clears the sheet's top edge. When four do not (a very
 * short viewport), the Hotel button leaves the stack: the sheet's Stay chip already switches the
 * map to the hotel layer, so nothing becomes unreachable.
 */
export function phoneStackFits({ buttons, safeTop, viewportHeight, obstruction }: {
  buttons: number
  safeTop: number
  viewportHeight: number
  obstruction: number
}): boolean {
  if (obstruction <= 0 || buttons <= 0) return true
  const bottom = controlsTop(safeTop) + buttons * MOBILE_CONTROL_SIZE + (buttons - 1) * MOBILE_STACK_GAP
  return bottom + STACK_SHEET_GAP <= viewportHeight - obstruction
}

const DESKTOP_BREAKPOINT = 768

// The trip layout an embed pinned (the ChatGPT widget forces 'mobile' in a wide iframe), or null.
// Held here rather than in lib/trip/use-trip-layout so this module stays import-free: tests that
// mock use-trip-layout still get real padding. Set only through forceTripLayout, which notifies.
let forcedLayout: 'mobile' | 'desktop' | null = null

/** Internal to forceTripLayout (lib/trip/use-trip-layout); call that instead. */
export function setForcedLayout(layout: 'mobile' | 'desktop' | null): void {
  forcedLayout = layout
}

/** The override only, never the viewport result. Re-exported by lib/trip/use-trip-layout. */
export function getForcedTripLayout(): 'mobile' | 'desktop' | null {
  return forcedLayout
}

/** Desktop: room between the panel's right edge and a framed pin (its radius and name pill). */
export const DESKTOP_PANEL_GAP = 40
/** Desktop pad on a side nothing covers. */
export const DESKTOP_EDGE = 80
/** The gap kept between a control's edge and a framed pin's drawn edge. */
const CONTROL_CLEARANCE = PIN_RADIUS + 2

export function computeFramePadding({
  width, height, obstruction, popupRoom = false, safeTop = 0, controls, leftObstruction = 0,
}: {
  width: number
  height: number
  /** Pixels the mobile sheet covers at the bottom; 0 when hidden or absent. */
  obstruction: number
  /** The resolved top safe-area inset (px); the phone controls sit below it. Ignored on desktop. */
  safeTop?: number
  /** Bias the pin into the upper third so an evidence popup has somewhere to open (desktop). */
  popupRoom?: boolean
  /** The map controls' measured rects, in canvas pixels. Any the base pads do not already clear
   *  push the cheapest pad outward. Omitted: the base pads (which clear the modelled phone stack). */
  controls?: readonly Rect[]
  /** Desktop: pixels the floating panel covers at the left (its right edge); 0 when collapsed. */
  leftObstruction?: number
}): FramePadding {
  const forced = getForcedTripLayout()
  const wide = forced ? forced === 'desktop' : width >= DESKTOP_BREAKPOINT
  const wanted = wide
    ? {
        top: DESKTOP_EDGE, right: DESKTOP_EDGE, bottom: DESKTOP_EDGE,
        left: leftObstruction > 0 ? leftObstruction + DESKTOP_PANEL_GAP : DESKTOP_EDGE,
      }
    : {
        // Below the top row of controls wherever they really are: the constant is the 12px case.
        top: MOBILE_TOP_CLEARANCE + (controlsTop(safeTop) - MOBILE_CONTROL_INSET),
        right: MOBILE_RIGHT_CLEARANCE,
        bottom: obstruction > 0 ? obstruction + MOBILE_SHEET_GAP : MOBILE_BARE_BOTTOM,
        left: MOBILE_LEFT,
      }

  // Solving `0.3H = top + (H - top - bottom)/2` for bottom. Only desktop needs it: on a phone the
  // sheet pad already pushes the pin well above centre. Applied BEFORE the cap, so an extreme
  // viewport degrades to "framed tight" rather than an abandoned camera.
  if (popupRoom && wide) wanted.bottom = wanted.top + Math.round(height * 0.4)

  const pads = clearControls(wanted, width, height, controls ?? [])

  // On a phone the controls are at the top and the sheet at the bottom: when the axis is over
  // budget (an expanded sheet), the sheet side gives way first, so a framed pin can be squeezed
  // toward the sheet but is never pushed back under the back button or the stack.
  const [top, bottom] = fitAxis(pads.top, pads.bottom, height, wide ? null : 'a')
  const [left, right] = fitAxis(pads.left, pads.right, width, null)
  return { top, right, bottom, left }
}

/**
 * Push pads outward until no control (inflated by a pin's radius) intersects the framed area.
 * Per control, the side that needs the smallest increase wins: a stack on the right edge widens
 * the right pad, a button along the top deepens the top pad.
 */
function clearControls(base: FramePadding, W: number, H: number, controls: readonly Rect[]): FramePadding {
  const pads = { ...base }
  for (const c of controls) {
    if (c.w <= 0 || c.h <= 0) continue
    const intersects = c.x + c.w + CONTROL_CLEARANCE > pads.left && c.x - CONTROL_CLEARANCE < W - pads.right
      && c.y + c.h + CONTROL_CLEARANCE > pads.top && c.y - CONTROL_CLEARANCE < H - pads.bottom
    if (!intersects) continue
    const need: Array<[keyof FramePadding, number]> = [
      ['top', c.y + c.h + CONTROL_CLEARANCE],
      ['bottom', H - c.y + CONTROL_CLEARANCE],
      ['left', c.x + c.w + CONTROL_CLEARANCE],
      ['right', W - c.x + CONTROL_CLEARANCE],
    ]
    const [side, value] = need.reduce((best, cur) => (cur[1] - pads[cur[0]] < best[1] - pads[best[0]] ? cur : best))
    pads[side] = Math.ceil(value)
  }
  return pads
}

// Never let opposing pads consume the canvas: Mapbox abandons the fit entirely rather than doing
// its best. Cap each axis at 70% — "framed a bit tight", not "not framed". With a protected side,
// the other side shrinks first; without one (or if the protected side alone is over), both scale.
function fitAxis(a: number, b: number, extent: number, protect: 'a' | null): readonly [number, number] {
  const budget = extent * 0.7
  const total = a + b
  if (total <= budget || total === 0) return [a, b]
  if (protect === 'a' && a <= budget) return [a, Math.floor(budget - a)]
  const scale = budget / total
  return [Math.floor(a * scale), Math.floor(b * scale)]
}
