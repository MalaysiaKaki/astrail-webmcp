'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { fitLabel, type FitTarget } from '@/lib/trip/fit-target'
import { AgentTriggerSlot } from '@/lib/webmcp/agent-trigger-slot'
import MapControlStack from '@/components/map/MapControlStack'
import { phoneStackFits } from '@/components/map/frame-padding'
import { useReportControls } from '@/lib/trip/control-obstruction'
import { useSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { readSafeAreaTop } from '@/lib/trip/safe-area'

/**
 * The phone's map chrome: a back circle top-left and a vertical stack of circles top-right. Nothing
 * else floats over the map — the trip's title and dates live in the sheet's header.
 *
 * Stack order, top down: the agent trigger (portalled into its slot by the shell's WebMcpDock, and
 * empty — so collapsed — when the browser has no WebMCP), Fit, 3D, then the hotel layer toggle. The
 * agent sits first because it is the one control that stays while the sheet is expanded over the
 * map (Fit, 3D and the layer toggle act on a map you can no longer see), so it never moves. The
 * stack itself is the shared MapControlStack; every control reports its measured rect so the
 * camera pads around where it really is.
 *
 * Geometry (inset, size, gap) is mirrored in components/map/frame-padding.ts, which pads the camera
 * so no framed pin can land under one of these; keep the two in step.
 */
export default function MobileMapControls({
  sheetExpanded, fitTarget, onFit, showLayerToggle, layerMode, canUseHubLayer, onToggleLayer,
  mode3d, onToggle3d,
}: {
  sheetExpanded: boolean
  /** What Fit frames right now, or null to hide it (nothing on the trip is located). */
  fitTarget: FitTarget | null
  onFit: () => void
  showLayerToggle: boolean
  layerMode: 'route' | 'hub'
  canUseHubLayer: boolean
  onToggleLayer: () => void
  /** The trip camera's 3D mode (TripWorkspace owns it; TripMap honours it). */
  mode3d: boolean
  onToggle3d: () => void
}) {
  const hub = layerMode === 'hub'
  // Always allowed to go BACK to the route; only switching to the hub needs a placed hotel.
  const layerDisabled = !hub && !canUseHubLayer
  const backRef = useRef<HTMLAnchorElement>(null)
  useReportControls(backRef, 'trip-back', [])
  // Plan amendment 3: at most agent, Fit, 3D, Hotel. On a viewport too short for four above the
  // compact sheet, Hotel leaves the stack — the sheet's Stay chip switches to the hotel layer too.
  const obstruction = useSheetObstruction()
  const hotelFits = phoneStackFits({
    buttons: 1 + (fitTarget ? 1 : 0) + 2,   // the agent is counted even when absent: stable layout
    safeTop: readSafeAreaTop(),
    viewportHeight: typeof window === 'undefined' ? 844 : window.innerHeight,
    obstruction,
  })
  return (
    <>
      <Link ref={backRef} href="/app/trips" aria-label="All trails" data-map-control
        className={`${EDGE} left-3 m-btn-icon pointer-events-auto`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="15 5 8 12 15 19" />
        </svg>
      </Link>

      <MapControlStack
        variant="phone"
        owner="trip-stack"
        className={`${EDGE} right-3`}
        onlyLeading={sheetExpanded}
        leading={<AgentTriggerSlot className="empty:hidden" measure />}
        fit={fitTarget ? { label: fitLabel(fitTarget), onFit } : null}
        mode3d={mode3d}
        onToggle3d={onToggle3d}
        trailing={showLayerToggle && hotelFits ? (
          <button
            type="button"
            data-map-control
            onClick={onToggleLayer}
            aria-label="Hotel map layer"
            aria-pressed={hub}
            disabled={layerDisabled}
            title={layerDisabled ? 'No hotel could be placed on the map' : undefined}
            className={[
              'm-btn-icon pointer-events-auto',
              // `!`: the kit's unlayered `cursor: pointer` outranks a plain utility.
              layerDisabled ? 'cursor-not-allowed! opacity-50' : '',
            ].join(' ')}
          >
            <svg data-icon="bed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" />
              <circle cx="7" cy="11" r="1.8" />
            </svg>
          </button>
        ) : null}
      />
    </>
  )
}

/** Above the sheet (z-10) so the stack stays usable over an expanded sheet. */
const EDGE = 'absolute z-20 top-[max(12px,env(safe-area-inset-top))]'

