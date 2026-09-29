import type mapboxgl from 'mapbox-gl'
import { getControlRects } from '@/lib/trip/control-obstruction'
import { getPanelObstruction } from '@/lib/trip/panel-obstruction'
import { readSafeAreaTop } from '@/lib/trip/safe-area'
import { getSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { computeFramePadding, type FramePadding } from './frame-padding'

/**
 * The camera padding for TripMap's framing, measured from the live map (moved out of TripMap.tsx,
 * unchanged). The details panel overlays the map — the left panel on desktop, the stop sheet on a
 * phone — so uniform padding would frame a day's pins right underneath it. The geometry (and why
 * it is measured against the CANVAS, capped at 70%) lives in ./frame-padding; this only measures.
 * `popupRoom` biases the pin into the upper third so a card has somewhere to go.
 */
export function measureFramePadding(map: mapboxgl.Map | null, mobile: boolean, popupRoom?: boolean): FramePadding {
  // Defensive: the map may not be ready, and framing must never throw — a padding helper
  // taking down the whole map effect would be a far worse bug than a loosely framed camera.
  const canvas = typeof map?.getCanvas === 'function' ? map.getCanvas() : null
  // `??`, not `||`: a canvas measured at ZERO (transiently, mid-layout) is a real measurement.
  // No canvas at all still falls back to the window.
  const win = typeof window === 'undefined' ? { w: 1024, h: 768 } : { w: window.innerWidth, h: window.innerHeight }
  // The controls measured themselves in viewport pixels; the pads are in canvas pixels.
  const container = typeof map?.getContainer === 'function' ? map.getContainer() : null
  const origin = typeof container?.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null
  const controls = getControlRects().map((r) => ({ ...r, x: r.x - (origin?.left ?? 0), y: r.y - (origin?.top ?? 0) }))
  return computeFramePadding({
    controls,
    // The desktop floating panel's measured right edge (0 when collapsed); the phone sheet is
    // the bottom obstruction. Each layout only ever publishes its own.
    leftObstruction: mobile ? 0 : getPanelObstruction(),
    width: canvas?.clientWidth ?? win.w,
    height: canvas?.clientHeight ?? win.h,
    obstruction: getSheetObstruction(),
    popupRoom,
    // The phone controls sit below the notch (max(12px, env(safe-area-inset-top))); the camera
    // clears them where they really are. Desktop has no such controls and never reads it.
    safeTop: mobile ? readSafeAreaTop() : 0,
  })
}
