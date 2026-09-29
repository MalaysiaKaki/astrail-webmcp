'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import mapboxgl from 'mapbox-gl'
import type { TripBundle } from '@/lib/trip/backend-types'
import { getTrip } from '@/lib/trip/supabase-api'
import { markTripFramed } from '@/lib/trip/map-handoff'
import { getControlRects } from '@/lib/trip/control-obstruction'
import { useSharedMap } from '@/components/map/MapProvider'
import MapControlStack from '@/components/map/MapControlStack'
import { cameraPitch, createTerrainController } from '@/components/map/camera-mode'
import type { TerrainController, TerrainMap } from '@/components/map/camera-mode'
import { dashboardPadding } from './dashboard-camera'

/* Right pane of the /app/trips three-pane. Renders no canvas of its own: it drives the
   shared, fixed Mapbox instance (MapProvider, z-0 behind the whole shell). The paper nav +
   inventory panes (z-10) mask the left of the viewport, so the map shows only through the
   transparent right-hand window.

     · idle    — the whole dawn globe, framed in the window, spinning gently. Speed is
                 deliberately calm (SPIN_DEG_PER_SEC) — an earlier faster spin read as dizzy.
                 Stops the instant the user grabs the globe, uses a map control or selects a
                 trip; skipped under reduced motion.
     · select  — fetch the trip, drop its pins, and fly the camera down into them, framed
                 into the window.

   Controls (web revamp C5): the shared MapControlStack, desktop variant, top-right of the window
   like the trip page — zoom in/out, 3D and Fit. The pane only exists from 1024 (TripsList), so
   there is no phone variant here. 3D is the shared camera mode (components/map/camera-mode): while
   it is on, every camera move this pane makes takes its pitch from it and our terrain + fog are on
   the shared map; it defaults off and is removed on unmount, so it never outlives the route. Fit
   has no "all trips" meaning here — the list payload carries no coordinates and the pane fetches a
   trip only when it is selected — so Fit re-frames what is on screen: the selected trip, or the
   whole globe while idle. Framing pads around the stack's measured rects. */

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

// A place with missing/zero/out-of-range coords is unresolved (a "saved with gaps" trip has
// these). It must not get a pin, and must NOT extend the frame — one (0,0) drags the camera
// out to span half the globe instead of zooming to the real places.
function hasRealCoords(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) &&
    Math.abs(lng) <= 180 && Math.abs(lat) <= 90 &&
    (lng !== 0 || lat !== 0)
  )
}

const IDLE_GLOBE_ZOOM = 1.4 // whole globe, comfortably filling the window
const SPIN_DEG_PER_SEC = 3 // calm ambient idle rotation (~2 min/revolution); 5 read as dizzy
const ZOOM_MS = 300
const MODE_EASE_MS = 900
const FIT_MS = 1200

export default function TripMapDashboard({
  selectedTripId,
  windowRef,
}: {
  selectedTripId: string | null
  windowRef: RefObject<HTMLElement | null>
}) {
  const { hasToken, ready, getMap, acquire, release, setMarkers } = useSharedMap()
  const bundleCacheRef = useRef<Map<string, TripBundle>>(new Map())
  // Monotonic id so a slow fetch for an earlier selection can't land after a newer one.
  const reqRef = useRef(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'mapped' | 'no-coords'>('idle')
  // 3D camera mode. The ref is what camera moves read, so a toggle applies at once and a framing
  // already in flight is solved at the mode it was started under.
  const [mode3d, setMode3d] = useState(false)
  const mode3dRef = useRef(false)
  // Created on the first 3D toggle, so no DEM source exists until someone asks for terrain.
  const terrainRef = useRef<TerrainController | null>(null)
  // Stops the idle spin; set by the idle effect, called by any control the user presses.
  const haltSpinRef = useRef<() => void>(() => {})
  // Re-frames the selected trip (Fit); null when nothing of it is located.
  const refitRef = useRef<((duration: number) => void) | null>(null)

  // Dawn-lit map. Acquired once; the camera is driven by the effects below. On the way out our
  // terrain comes off the SHARED map before it is released (dispose clears terrain, then the
  // source, and puts the previous fog back).
  useEffect(() => {
    acquire({ interactive: true, lightPreset: 'dawn', zoom: IDLE_GLOBE_ZOOM })
    return () => {
      terrainRef.current?.dispose()
      terrainRef.current = null
      release()
    }
  }, [acquire, release])

  // Frame into the actual right-hand window (measured), clear of the control stack (measured),
  // so content lands inside it whatever the pane widths are — no hard-coded offset.
  function framePadding(): mapboxgl.PaddingOptions {
    const r = windowRef.current?.getBoundingClientRect() ?? null
    if (typeof window === 'undefined') return dashboardPadding(null, { w: 0, h: 0 }, [])
    return dashboardPadding(r, { w: window.innerWidth, h: window.innerHeight }, getControlRects())
  }

  function frameGlobe(duration: number) {
    const map = getMap()
    if (!map) return
    map.easeTo({
      center: [map.getCenter().lng, 15],
      zoom: IDLE_GLOBE_ZOOM,
      pitch: cameraPitch(mode3dRef.current),
      bearing: 0,
      padding: framePadding(),
      duration,
    })
  }

  // Idle → frame the whole globe into the window (instant; also un-zooms if we arrived back
  // from a zoomed-in trip), then spin it gently. The spin halts on the first grab gesture or
  // control press so a browse isn't fought, and is skipped entirely under reduced motion.
  useEffect(() => {
    if (!ready || selectedTripId) return
    const map = getMap()
    if (!map) return
    setStatus('idle')
    refitRef.current = null
    frameGlobe(0)

    if (prefersReducedMotion()) return

    let stopped = false
    let raf = 0
    let last = performance.now()
    const halt = () => { stopped = true }
    haltSpinRef.current = halt
    map.on('mousedown', halt)
    map.on('touchstart', halt)
    map.on('dragstart', halt)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!stopped) {
        const c = map.getCenter()
        map.setCenter([c.lng - SPIN_DEG_PER_SEC * dt, c.lat])
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      haltSpinRef.current = () => {}
      map.off('mousedown', halt)
      map.off('touchstart', halt)
      map.off('dragstart', halt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedTripId])

  // Selection → fetch the bundle, drop pins, and fly the camera into the trip.
  useEffect(() => {
    if (!ready || !selectedTripId) return
    const map = getMap()
    if (!map) return

    const req = ++reqRef.current
    let cancelled = false
    refitRef.current = null
    setStatus('loading')

    async function run() {
      let bundle = bundleCacheRef.current.get(selectedTripId!)
      if (!bundle) {
        const fetched = await getTrip(selectedTripId!)
        if (!fetched) { if (req === reqRef.current) setStatus('idle'); return }
        bundle = fetched
        bundleCacheRef.current.set(selectedTripId!, bundle)
      }
      // A newer selection won the race, or we unmounted — drop this result.
      if (cancelled || req !== reqRef.current) return

      const pts = bundle.places
        .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
        .map((tp) => [tp.place.lng, tp.place.lat] as [number, number])

      const markers = pts.map(([lng, lat]) => {
        const el = document.createElement('div')
        el.className = 'constellation-pin constellation-pin--receding'
        return new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map!)
      })
      setMarkers(markers)

      if (pts.length === 0) {
        // Saved-with-gaps / nothing located yet: don't fit to (0,0). Ease to a calm frame.
        setStatus('no-coords')
        map!.easeTo({ zoom: 2.6, pitch: cameraPitch(mode3dRef.current), padding: framePadding(), duration: 1600, essential: true })
        return
      }
      setStatus('mapped')
      // We've framed this trip on the shared map — let the workspace settle in seamlessly
      // instead of re-flying if the user opens it.
      markTripFramed(selectedTripId!)
      // The pitch travels in the same call as the padding and target, so Mapbox solves the
      // tilted camera for the padded window (never a separate pitch-only ease afterwards).
      const frame = (duration: number) => {
        const pitch = cameraPitch(mode3dRef.current)
        if (pts.length === 1) {
          map!.flyTo({ center: pts[0], zoom: 12, pitch, padding: framePadding(), duration, essential: true })
          return
        }
        const bounds = new mapboxgl.LngLatBounds()
        pts.forEach((p) => bounds.extend(p))
        map!.fitBounds(bounds, { padding: framePadding(), maxZoom: 13, pitch, duration, essential: true })
      }
      refitRef.current = frame
      frame(pts.length === 1 ? 2000 : 2200)
    }

    void run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedTripId])

  function toggle3d() {
    const map = getMap()
    if (!map) return
    haltSpinRef.current()
    const next = !mode3dRef.current
    mode3dRef.current = next
    setMode3d(next)
    terrainRef.current ??= createTerrainController(map as unknown as TerrainMap)
    terrainRef.current.set(next)
    map.easeTo({ pitch: cameraPitch(next), duration: prefersReducedMotion() ? 0 : MODE_EASE_MS })
  }

  function zoom(direction: 'in' | 'out') {
    const map = getMap()
    if (!map) return
    haltSpinRef.current()
    const opts = { duration: prefersReducedMotion() ? 0 : ZOOM_MS }
    if (direction === 'in') map.zoomIn(opts)
    else map.zoomOut(opts)
  }

  const duration = () => (prefersReducedMotion() ? 0 : FIT_MS)
  const fit =
    status === 'idle'
      ? { label: 'Show the whole globe', onFit: () => { haltSpinRef.current(); frameGlobe(duration()) } }
      : status === 'mapped'
        ? { label: 'Fit trip on the map', onFit: () => refitRef.current?.(duration()) }
        : null

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-[family-name:var(--font-ui)] text-[length:var(--t-meta)] text-[color:var(--m-text-muted)]">
          Map unavailable — token missing
        </p>
      </div>
    )
  }

  // White kit controls and pill float over the map (Placify's floating-control language); the
  // canvas itself is the shell's fixed layer, so there's nothing else to render here.
  return (
    <>
      <MapControlStack
        variant="desktop"
        owner="trips-dashboard-stack"
        className="paper-scope pointer-events-none absolute right-4 top-4 z-20"
        mode3d={mode3d}
        onToggle3d={toggle3d}
        onZoomIn={() => zoom('in')}
        onZoomOut={() => zoom('out')}
        fit={fit}
      />
      {status === 'loading' || status === 'no-coords' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">
          <span className="m-pill-badge font-[family-name:var(--font-ui)] text-[length:var(--t-meta)] font-semibold">
            {status === 'loading' ? 'Loading trip…' : 'No mapped places yet'}
          </span>
        </div>
      ) : null}
    </>
  )
}
