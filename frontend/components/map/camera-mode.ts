/**
 * The map's 3D camera mode — a STABLE, shared interface (frozen after plan phase A5).
 *
 * 3D is a mode, not a one-off move: while it is on, every camera command a map surface issues takes
 * its pitch from `cameraPitch(true)`, and our terrain + fog are on the map; while it is off, pitch
 * is 0 and none of ours exists (no `astrail-dem` source, so no DEM tiles are requested for it).
 *
 * Measured live (2026-09-29): Mapbox Standard carries its own globe-scale terrain whose exaggeration
 * interpolates to 0 by z13.7. It is inherited from the style import, so `setTerrain(null)` cannot
 * remove it, and at trip zooms it is flat and costs ~0-2 DEM requests. It is the style's baseline,
 * not a 3D mode, and this controller leaves it alone.
 *
 * Public API (other surfaces, e.g. /app/trips, import exactly these):
 *   - `cameraPitch(mode3d)`            the pitch for any camera command under the mode
 *   - `createTerrainController(map)`   → `{ set(on), dispose(), on }` owns terrain + fog on a map
 *   - `nativeBuildings(map)`           whether the style draws its own 3D buildings
 *   - `PITCH_3D`, `PITCH_FLAT`, `DEM_SOURCE_ID`, `TERRAIN_EXAGGERATION`
 * The UI half is components/map/MapControlStack.tsx.
 *
 * The map is SHARED (MapProvider keeps one instance across /app routes), so a controller must leave
 * it exactly as it found it: `dispose()` clears terrain before removing the source Mapbox would
 * otherwise refuse to remove, and puts the fog that was there back rather than deleting it. Call
 * dispose() only while the map is alive (a removed map has no style to restore into). Fog, not
 * the sky layer: the Standard style runs on the globe projection, where sky is not drawn.
 */

import type { FogSpecification, TerrainSpecification } from 'mapbox-gl'

export const PITCH_3D = 60
export const PITCH_FLAT = 0
export const TERRAIN_EXAGGERATION = 1.3
/** Owned by whichever controller is on; no other code adds or removes it. */
export const DEM_SOURCE_ID = 'astrail-dem'
const DEM_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1'

/** Soft dawn haze toward the horizon, matching the trip page's `dawn` light preset. */
const FOG_3D: FogSpecification = {
  range: [0.8, 8],
  color: 'rgb(244, 236, 224)',
  'high-color': 'rgb(170, 196, 230)',
  'horizon-blend': 0.06,
  'space-color': 'rgb(22, 26, 44)',
  'star-intensity': 0.08,
}

export function cameraPitch(mode3d: boolean): number {
  return mode3d ? PITCH_3D : PITCH_FLAT
}

/** The slice of mapboxgl.Map the controller needs; narrow so tests can supply a stand-in. */
export type TerrainMap = {
  getSource: (id: string) => unknown
  addSource: (id: string, spec: never) => unknown
  removeSource: (id: string) => unknown
  setTerrain: (terrain: TerrainSpecification | null) => unknown
  getTerrain: () => TerrainSpecification | null | undefined
  getFog: () => FogSpecification | null | undefined
  setFog: (fog: FogSpecification | null) => unknown
  once: (event: 'idle', fn: () => void) => unknown
  off: (event: 'idle', fn: () => void) => unknown
  getConfigProperty?: (importId: string, key: string) => unknown
}

export type TerrainController = {
  /** Turn terrain + fog on or off. Idempotent; safe before the style has loaded. */
  set: (on: boolean) => void
  /** Leave the shared map clean and ignore every later call. */
  dispose: () => void
  readonly on: boolean
}

export function createTerrainController(map: TerrainMap): TerrainController {
  // null until the first request.
  let applied: boolean | null = null
  let disposed = false
  // Bumped on every request: a deferred step compares its own token and gives up if a later request
  // (off, another on, dispose) superseded it. This is what stops an outgoing trip's queued callback
  // from re-enabling terrain on the next route.
  let generation = 0
  let pending: (() => void) | null = null
  // The fog the map had before ours, put back when 3D goes off or the controller is disposed.
  let savedFog: { value: FogSpecification | null | undefined } | null = null
  // Whether the fog on the map right now is ours (only then is there anything to put back).
  let fogIsOurs = false

  function cancelPending() {
    if (pending) map.off('idle', pending)
    pending = null
  }

  /** Run `step` now, or once the map settles if the style is not ready yet — unless superseded. */
  function run(token: number, step: () => void): void {
    if (token !== generation || disposed) return
    try {
      step()
    } catch {
      // "Style is not done loading": try again when the map next settles.
      cancelPending()
      const retry = () => { pending = null; run(token, step) }
      pending = retry
      map.once('idle', retry)
    }
  }

  function enable() {
    if (!fogIsOurs) savedFog = { value: map.getFog() }
    if (!map.getSource(DEM_SOURCE_ID)) {
      map.addSource(DEM_SOURCE_ID, { type: 'raster-dem', url: DEM_URL, tileSize: 512, maxzoom: 14 } as never)
    }
    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION })
    map.setFog(FOG_3D)
    fogIsOurs = true
  }

  function restoreFog() {
    if (!fogIsOurs || !savedFog) return
    map.setFog(savedFog.value ?? null)
    fogIsOurs = false
  }

  /** Flat: our terrain and source gone, the previous fog back. The style's own is not ours. */
  function flatten() {
    // Order matters: Mapbox refuses to remove a source that terrain still references.
    if (map.getTerrain()?.source === DEM_SOURCE_ID) map.setTerrain(null)
    if (map.getSource(DEM_SOURCE_ID)) map.removeSource(DEM_SOURCE_ID)
    restoreFog()
  }

  return {
    set(next: boolean) {
      if (disposed || next === applied) return
      applied = next
      generation++
      cancelPending()
      run(generation, next ? enable : flatten)
    },
    dispose() {
      if (disposed) return
      generation++
      cancelPending()
      disposed = true
      if (applied === null) return
      try {
        flatten()
      } catch {
        // The style is mid-reload; the next style load resets terrain and fog to its own anyway.
      }
    },
    get on() { return applied === true },
  }
}

/**
 * Whether the style draws its own 3D buildings (Mapbox Standard's basemap config). When it does,
 * the custom fill-extrusion layer must NOT be added as well — two sets of buildings z-fight.
 */
export function nativeBuildings(map: Pick<TerrainMap, 'getConfigProperty'>): boolean {
  try {
    for (const key of ['show3dObjects', 'show3dBuildings']) {
      const v = map.getConfigProperty?.('basemap', key)
      if (v !== undefined && v !== null) return true
    }
  } catch {
    // No `basemap` import: not the Standard style.
  }
  return false
}
