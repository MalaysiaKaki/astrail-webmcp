import type { ControlRect } from '@/lib/trip/control-obstruction'

/* Framing geometry for the /app/trips map pane. The camera drives the shared, full-viewport map but
   must frame into the transparent right-hand window, clear of the floating control stack. */

/** Breathing room inside the window when framing. */
export const FRAME_PAD = 56
/** Space kept between framed content and the control stack. */
export const CONTROL_GAP = 12

type WindowRect = { top: number; bottom: number; left: number; right: number }

/**
 * Camera padding for the measured window: FRAME_PAD inside each edge of the window, and on the right
 * at least enough to clear any control that sits inside the window (the stack at right-4). Controls
 * outside the window (another surface's stack) are ignored.
 */
export function dashboardPadding(
  win: WindowRect | null,
  viewport: { w: number; h: number },
  controls: readonly ControlRect[],
): { top: number; bottom: number; left: number; right: number } {
  if (!win) return { top: FRAME_PAD, right: FRAME_PAD, bottom: FRAME_PAD, left: FRAME_PAD }
  const pad = {
    top: Math.max(win.top, 0) + FRAME_PAD,
    bottom: Math.max(viewport.h - win.bottom, 0) + FRAME_PAD,
    left: Math.max(win.left, 0) + FRAME_PAD,
    right: Math.max(viewport.w - win.right, 0) + FRAME_PAD,
  }
  const inside = controls.filter((c) => c.x >= win.left && c.x < win.right)
  if (!inside.length) return pad
  const leftmost = Math.min(...inside.map((c) => c.x))
  return { ...pad, right: Math.max(pad.right, viewport.w - leftmost + CONTROL_GAP) }
}
