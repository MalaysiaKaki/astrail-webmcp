import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cameraPitch, createTerrainController, nativeBuildings,
  DEM_SOURCE_ID, PITCH_3D, PITCH_FLAT, TERRAIN_EXAGGERATION,
  type TerrainMap,
} from '@/components/map/camera-mode'

/* A small in-memory stand-in for the parts of mapboxgl.Map the controller touches. It keeps real
   state (sources, terrain, fog) so the tests assert outcomes, not call counts, and it throws the
   way Mapbox does when a source id is added twice or removed while terrain still uses it. */
function fakeMap(opts: { styleReady?: boolean; fog?: object | null; config?: Record<string, unknown> } = {}) {
  const sources = new Map<string, object>()
  let terrain: { source: string; exaggeration?: number } | null = null
  let fog: object | null | undefined = opts.fog
  let styleReady = opts.styleReady ?? true
  const onceHandlers: Array<[string, () => void]> = []
  const log: string[] = []
  const map: TerrainMap & { fire: (ev: string) => void; setStyleReady: (v: boolean) => void; log: string[]; terrainNow: () => typeof terrain; fogNow: () => typeof fog } = {
    getSource: (id: string) => sources.get(id) as never,
    addSource: (id: string, spec: object) => {
      if (!styleReady) throw new Error('Style is not done loading')
      if (sources.has(id)) throw new Error(`There is already a source with ID "${id}".`)
      sources.set(id, spec); log.push(`add:${id}`)
    },
    removeSource: (id: string) => {
      if (terrain?.source === id) throw new Error('Source cannot be removed while terrain is using it.')
      sources.delete(id); log.push(`remove:${id}`)
    },
    setTerrain: (t) => { terrain = (t as typeof terrain) ?? null; log.push(t ? 'terrain:on' : 'terrain:off') },
    getTerrain: () => terrain as never,
    getFog: () => fog as never,
    setFog: (f) => { fog = f as object | null; log.push(f ? 'fog:set' : 'fog:null') },
    once: (ev: string, fn: () => void) => { onceHandlers.push([ev, fn]) },
    off: (ev: string, fn: () => void) => {
      const i = onceHandlers.findIndex(([e, f]) => e === ev && f === fn)
      if (i >= 0) onceHandlers.splice(i, 1)
    },
    getConfigProperty: (_imp: string, key: string) => (opts.config ?? {})[key] as never,
    fire: (ev: string) => {
      const due = onceHandlers.filter(([e]) => e === ev)
      for (const h of due) onceHandlers.splice(onceHandlers.indexOf(h), 1)
      due.forEach(([, fn]) => fn())
    },
    setStyleReady: (v: boolean) => { styleReady = v },
    log,
    terrainNow: () => terrain,
    fogNow: () => fog,
  }
  return map
}

describe('cameraPitch', () => {
  it('is the one pitch every trip camera command uses: flat off, tilted on', () => {
    expect(cameraPitch(false)).toBe(PITCH_FLAT)
    expect(cameraPitch(false)).toBe(0)
    expect(cameraPitch(true)).toBe(PITCH_3D)
    expect(PITCH_3D).toBeGreaterThan(45)
  })
})

describe('createTerrainController', () => {
  let map: ReturnType<typeof fakeMap>
  beforeEach(() => { map = fakeMap({ fog: { color: 'standard' } }) })

  it('adds nothing until 3D is turned on (no DEM tiles are ever requested while off)', () => {
    const t = createTerrainController(map)
    t.set(false)
    expect(map.getSource(DEM_SOURCE_ID)).toBeUndefined()
    expect(map.log).toEqual([])
  })

  it('on: owns the DEM source, enables terrain on it, and sets a fog', () => {
    const t = createTerrainController(map)
    t.set(true)
    expect(map.getSource(DEM_SOURCE_ID)).toMatchObject({ type: 'raster-dem' })
    expect(map.terrainNow()).toEqual({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION })
    expect(map.fogNow()).not.toEqual({ color: 'standard' })
    expect(t.on).toBe(true)
  })

  it('off: terrain is cleared BEFORE the source is removed, and the previous fog comes back', () => {
    const t = createTerrainController(map)
    t.set(true)
    map.log.length = 0
    t.set(false)
    expect(map.log.indexOf('terrain:off')).toBeLessThan(map.log.indexOf(`remove:${DEM_SOURCE_ID}`))
    expect(map.getSource(DEM_SOURCE_ID)).toBeUndefined()
    expect(map.terrainNow()).toBeNull()
    expect(map.fogNow()).toEqual({ color: 'standard' })
  })

  it('restores an ABSENT fog as null rather than leaving ours behind', () => {
    const bare = fakeMap({ fog: undefined })
    const t = createTerrainController(bare)
    t.set(true); t.set(false)
    expect(bare.fogNow()).toBeNull()
  })

  it('survives rapid repeated toggles without a duplicate-source error', () => {
    const t = createTerrainController(map)
    expect(() => { for (let i = 0; i < 9; i++) t.set(i % 2 === 0) }).not.toThrow()
    expect(t.on).toBe(true)
    expect(map.log.filter((l) => l === `add:${DEM_SOURCE_ID}`)).toHaveLength(5)
    expect(map.terrainNow()?.source).toBe(DEM_SOURCE_ID)
  })

  it('adopts a DEM source already on the map (a remount) instead of adding a second', () => {
    map.addSource(DEM_SOURCE_ID, { type: 'raster-dem' } as never)
    const t = createTerrainController(map)
    expect(() => t.set(true)).not.toThrow()
    expect(map.terrainNow()?.source).toBe(DEM_SOURCE_ID)
  })

  it('defers to the style when it is not ready, and applies once it is', () => {
    const early = fakeMap({ styleReady: false })
    const t = createTerrainController(early)
    t.set(true)
    expect(early.terrainNow()).toBeNull()
    early.setStyleReady(true)
    early.fire('idle')
    expect(early.terrainNow()?.source).toBe(DEM_SOURCE_ID)
  })

  it('a pending apply from a superseded request never re-enables terrain (generation token)', () => {
    const early = fakeMap({ styleReady: false })
    const t = createTerrainController(early)
    t.set(true)          // queued
    t.set(false)         // user turned it off before the style was ready
    early.setStyleReady(true)
    early.fire('idle')
    expect(early.terrainNow()).toBeNull()
    expect(early.getSource(DEM_SOURCE_ID)).toBeUndefined()
  })

  it('dispose(): leaves the shared map clean and cancels anything pending', () => {
    const t = createTerrainController(map)
    t.set(true)
    t.dispose()
    expect(map.terrainNow()).toBeNull()
    expect(map.getSource(DEM_SOURCE_ID)).toBeUndefined()
    expect(map.fogNow()).toEqual({ color: 'standard' })

    const early = fakeMap({ styleReady: false })
    const t2 = createTerrainController(early)
    t2.set(true)
    t2.dispose()         // the trip route left before the style was ready
    early.setStyleReady(true)
    early.fire('idle')
    expect(early.terrainNow()).toBeNull()
  })

  it('a disposed controller ignores later requests (an outgoing trip cannot re-enable terrain)', () => {
    const t = createTerrainController(map)
    t.dispose()
    t.set(true)
    expect(map.terrainNow()).toBeNull()
  })
})

describe('the Standard style\'s own terrain', () => {
  const styleTerrain = { source: 'mapbox-dem', exaggeration: 1 }

  it('is left alone: off never touches it, on replaces it, off removes only ours', () => {
    const map = fakeMap({ fog: { color: 'standard' } })
    map.setTerrain(styleTerrain as never); map.log.length = 0
    const t = createTerrainController(map)
    t.set(false)
    expect(map.log).toEqual([])
    t.set(true)
    expect(map.terrainNow()?.source).toBe(DEM_SOURCE_ID)
    t.set(false)
    expect(map.getSource(DEM_SOURCE_ID)).toBeUndefined()
    expect(map.fogNow()).toEqual({ color: 'standard' })
  })

  it('a controller that never turned on leaves the map alone on dispose', () => {
    const map = fakeMap()
    map.setTerrain(styleTerrain as never); map.log.length = 0
    const t = createTerrainController(map)
    t.set(false)
    t.dispose()
    expect(map.log).toEqual([])
  })
})

describe('nativeBuildings', () => {
  it('prefers the Standard style\'s own 3D buildings when the config exists', () => {
    expect(nativeBuildings(fakeMap({ config: { show3dObjects: true } }))).toBe(true)
    expect(nativeBuildings(fakeMap({ config: { show3dBuildings: true } }))).toBe(true)
  })
  it('falls back to the custom layer on a style without that config', () => {
    expect(nativeBuildings(fakeMap({ config: {} }))).toBe(false)
    const throwing = { ...fakeMap(), getConfigProperty: vi.fn(() => { throw new Error('no import') }) }
    expect(nativeBuildings(throwing)).toBe(false)
  })
})
