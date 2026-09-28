'use client'

import Link from 'next/link'
import type { FitTarget } from '@/lib/trip/fit-target'
import { AgentTriggerSlot } from '@/lib/webmcp/agent-trigger-slot'

/**
 * The phone's map chrome: a back circle top-left and a vertical stack of circles top-right. Nothing
 * else floats over the map — the trip's title and dates live in the sheet's header.
 *
 * Stack order, top down: the agent trigger (portalled into its slot by the shell's WebMcpDock, and
 * empty — so collapsed — when the browser has no WebMCP), Fit, then the hotel layer toggle. The
 * agent sits first because it is the one control that stays while the sheet is expanded over the
 * map (Fit and the layer toggle act on a map you can no longer see), so it never moves.
 *
 * Geometry (inset, size, gap) is mirrored in components/map/frame-padding.ts, which pads the camera
 * so no framed pin can land under one of these; keep the two in step.
 */
export default function MobileMapControls({
  sheetExpanded, fitTarget, onFit, showLayerToggle, layerMode, canUseHubLayer, onToggleLayer,
}: {
  sheetExpanded: boolean
  /** What Fit frames right now, or null to hide it (nothing on the trip is located). */
  fitTarget: FitTarget | null
  onFit: () => void
  showLayerToggle: boolean
  layerMode: 'route' | 'hub'
  canUseHubLayer: boolean
  onToggleLayer: () => void
}) {
  const hub = layerMode === 'hub'
  // Always allowed to go BACK to the route; only switching to the hub needs a placed hotel.
  const layerDisabled = !hub && !canUseHubLayer
  return (
    <>
      <Link href="/app/trips" aria-label="All trails" className={`${EDGE} left-3 m-btn-icon pointer-events-auto`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="15 5 8 12 15 19" />
        </svg>
      </Link>

      <div data-testid="map-control-stack" className={`${EDGE} right-3 flex flex-col gap-2`}>
        <AgentTriggerSlot className="empty:hidden" />
        {!sheetExpanded && fitTarget ? (
          <button type="button" onClick={onFit} aria-label={fitLabel(fitTarget)}
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
        ) : null}
        {!sheetExpanded && showLayerToggle ? (
          <button
            type="button"
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
      </div>
    </>
  )
}

/** Above the sheet (z-10) so the stack stays usable over an expanded sheet. */
const EDGE = 'absolute z-20 top-[max(12px,env(safe-area-inset-top))]'

function fitLabel(target: FitTarget): string {
  if (target === 'hub') return 'Fit map to the hotel'
  if (target === 'day') return 'Fit map to the day'
  return 'Fit map to the whole trip'
}
