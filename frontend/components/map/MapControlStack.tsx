'use client'

import { useRef } from 'react'
import { useReportControls } from '@/lib/trip/control-obstruction'

/**
 * The circular map control stack — a STABLE, shared interface (frozen after plan phase A5; the
 * camera half is components/map/camera-mode.ts).
 *
 * A vertical column of kit `m-btn-icon` circles (44px, focus ring, press scale, reduced motion
 * from the kit). It renders buttons and reports their MEASURED rects to lib/trip/control-obstruction
 * under `owner`, so a map camera can pad around them; it holds no state and positions nothing — the
 * caller places it (a `className` with absolute/fixed offsets).
 *
 * Order, top down:
 *   phone:   leading (agent), Fit, 3D, trailing (Hotel) — zoom never shows: pinch is native
 *   desktop: leading, zoom in, zoom out, 3D, Fit, trailing
 * `onlyLeading` hides everything but `leading` (the phone sheet expanded over the map: Fit, 3D and
 * Hotel act on a map you can no longer see). Anything passed as `leading`/`trailing` that should be
 * padded around carries `data-map-control` itself.
 */
export type MapControlStackProps = {
  variant: 'phone' | 'desktop'
  /** Measurement key in the control-obstruction store; unique per mounted stack. */
  owner: string
  mode3d: boolean
  onToggle3d: () => void
  /** Desktop only. */
  onZoomIn?: () => void
  onZoomOut?: () => void
  /** Null hides Fit (nothing on the map is located). */
  fit?: { label: string; onFit: () => void } | null
  leading?: React.ReactNode
  trailing?: React.ReactNode
  onlyLeading?: boolean
  className?: string
}

export default function MapControlStack({
  variant, owner, mode3d, onToggle3d, onZoomIn, onZoomOut, fit, leading, trailing, onlyLeading = false, className,
}: MapControlStackProps) {
  const ref = useRef<HTMLDivElement>(null)
  const desktop = variant === 'desktop'
  const showZoom = desktop && !onlyLeading && onZoomIn && onZoomOut
  useReportControls(ref, owner, [variant, mode3d, onlyLeading, Boolean(fit), Boolean(trailing), Boolean(showZoom)])

  const fitButton = !onlyLeading && fit ? (
    <button key="fit" type="button" data-map-control onClick={fit.onFit} aria-label={fit.label}
      className="m-btn-icon pointer-events-auto">
      {/* A scope: "centre the map back on the route". Not a location arrow — this app never
          reads the device location, and that glyph would promise it. */}
      <svg data-icon="scope" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="6.5" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    </button>
  ) : null

  const threeD = !onlyLeading ? (
    <button key="3d" type="button" data-map-control onClick={onToggle3d}
      aria-label="3D view" aria-pressed={mode3d}
      title={mode3d ? 'Back to the flat map' : 'Tilt the map and show terrain'}
      className="m-btn-icon pointer-events-auto">
      {/* Text, not a cube glyph: "3D" is the label every map app has taught, and it reads at 44px. */}
      <span aria-hidden data-icon="3d" className="font-[family-name:var(--font-ui)] text-[14px] font-bold leading-none tracking-[0.02em]">3D</span>
    </button>
  ) : null

  const zoom = showZoom ? [
    <button key="in" type="button" data-map-control onClick={onZoomIn} aria-label="Zoom in"
      className="m-btn-icon pointer-events-auto">
      <svg data-icon="plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
        strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
    </button>,
    <button key="out" type="button" data-map-control onClick={onZoomOut} aria-label="Zoom out"
      className="m-btn-icon pointer-events-auto">
      <svg data-icon="minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
        strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
    </button>,
  ] : null

  return (
    <div ref={ref} data-testid={`map-control-stack${desktop ? '-desktop' : ''}`}
      className={['flex flex-col gap-2', className ?? ''].join(' ')}>
      {leading}
      {desktop ? <>{zoom}{threeD}{fitButton}</> : <>{fitButton}{threeD}</>}
      {!onlyLeading ? trailing : null}
    </div>
  )
}
