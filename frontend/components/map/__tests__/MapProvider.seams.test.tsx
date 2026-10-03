import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import MapProvider, { useSharedMap, type SharedMapContextValue } from '@/components/map/MapProvider'

/* Task 2 seams: an explicit accessToken and an onError for the widget's fallback. */

const { mapInstance, MapCtor, importGate } = vi.hoisted(() => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() })
  const mapInstance = {
    on: vi.fn(),
    setConfigProperty: vi.fn(),
    remove: vi.fn(), resize: vi.fn(), stop: vi.fn(),
    style: { setTransition: vi.fn() },
    scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(),
    keyboard: handler(), doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(),
  }
  const MapCtor = vi.fn(() => mapInstance)
  // fail: the next import rejects. hold: the next import waits for release().
  const importGate = { fail: 0, hold: null as null | Promise<void> }
  return { mapInstance, MapCtor, importGate }
})

// doMock per test (beforeEach), not a hoisted vi.mock: a hoisted factory's first success is cached
// for the file, and the import-failure cases need the factory to run again.
const mapboxFactory = async () => {
  if (importGate.hold) await importGate.hold
  if (importGate.fail > 0) { importGate.fail -= 1; throw new Error('chunk load failed https://x') }
  return { default: { Map: MapCtor, Marker: vi.fn(), LngLatBounds: vi.fn(), accessToken: '' } }
}
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

// A fresh registry loads the mocked bundle asynchronously: wait for every in-flight import to settle.
async function flush() {
  await act(async () => {
    await vi.dynamicImportSettled()
    await new Promise((r) => setTimeout(r, 0))
  })
}

const handlerFor = (event: string) => mapInstance.on.mock.calls.find((c) => c[0] === event)?.[1] as
  ((e?: unknown) => void) | undefined

let ctx: SharedMapContextValue | null = null
function Grabber() { ctx = useSharedMap(); return null }
function Consumer() {
  const { acquire, release } = useSharedMap()
  useEffect(() => {
    acquire({ interactive: true, lightPreset: 'dawn' })
    return () => release()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

describe('MapProvider seams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MapCtor.mockImplementation(() => mapInstance)
    importGate.fail = 0
    importGate.hold = null
    vi.resetModules()
    vi.doMock('mapbox-gl', mapboxFactory)
    ctx = null
    delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN
  })

  it('an explicit accessToken without the env var gives hasToken and builds the map with it', async () => {
    const onError = vi.fn()
    render(<MapProvider accessToken="pk.widget" onError={onError}><Grabber /><Consumer /></MapProvider>)
    await flush()
    expect(ctx!.hasToken).toBe(true)
    expect(MapCtor).toHaveBeenCalledTimes(1)
    const mapboxgl = (await import('mapbox-gl')).default as unknown as { accessToken: string }
    expect(mapboxgl.accessToken).toBe('pk.widget')
    expect(onError).not.toHaveBeenCalled()
  })

  it('an explicit accessToken wins over the env var', async () => {
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.env'
    render(<MapProvider accessToken=""><Grabber /><Consumer /></MapProvider>)
    await flush()
    expect(ctx!.hasToken).toBe(false)
    expect(MapCtor).not.toHaveBeenCalled()
  })

  it('reports a rejected Mapbox import once as "import", and a later acquire retries', async () => {
    importGate.fail = 1
    const onError = vi.fn()
    render(<MapProvider accessToken="pk.widget" onError={onError}><Grabber /><Consumer /></MapProvider>)
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('import')
    expect(MapCtor).not.toHaveBeenCalled()
    act(() => { ctx!.acquire({ interactive: true, lightPreset: 'dawn' }) })
    await flush()
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports a throwing constructor once as "construct", and a later acquire retries', async () => {
    MapCtor.mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    const onError = vi.fn()
    render(<MapProvider accessToken="pk.widget" onError={onError}><Grabber /><Consumer /></MapProvider>)
    await flush()
    expect(onError.mock.calls).toEqual([['construct']])
    act(() => { ctx!.acquire({ interactive: true, lightPreset: 'dawn' }) })
    await flush()
    expect(MapCtor).toHaveBeenCalledTimes(2)
    expect(ctx!.getMap()).toBe(mapInstance)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports the first pre-load map error once as "style", never with the payload', async () => {
    const onError = vi.fn()
    render(<MapProvider accessToken="pk.widget" onError={onError}><Consumer /></MapProvider>)
    await flush()
    const error = handlerFor('error')!
    act(() => { error({ error: new Error('401 https://api.mapbox.com/styles?access_token=pk.x') }) })
    act(() => { error({ error: new Error('again') }) })
    expect(onError.mock.calls).toEqual([['style']])
  })

  it('does not report map errors after load', async () => {
    const onError = vi.fn()
    render(<MapProvider accessToken="pk.widget" onError={onError}><Consumer /></MapProvider>)
    await flush()
    act(() => { handlerFor('load')!() })
    act(() => { handlerFor('error')!({ error: new Error('tile 404') }) })
    expect(onError).not.toHaveBeenCalled()
  })

  it('without onError registers no error listener (Mapbox keeps its default logging)', async () => {
    render(<MapProvider accessToken="pk.widget"><Consumer /></MapProvider>)
    await flush()
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(handlerFor('error')).toBeUndefined()
  })

  // Without onError the website must still see these as unhandled rejections (Sentry captures them).
  // Vitest's own listener would fail the run, so it is swapped out for a capture while each runs.
  async function unhandledDuring(run: () => Promise<void>): Promise<unknown[]> {
    const seen: unknown[] = []
    const vitestListeners = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    const capture = (reason: unknown) => { seen.push(reason) }
    process.on('unhandledRejection', capture)
    try {
      await run()
      await new Promise((r) => setTimeout(r, 10))
    } finally {
      process.off('unhandledRejection', capture)
      for (const l of vitestListeners) process.on('unhandledRejection', l)
    }
    return seen
  }

  it('without onError, a rejected import still surfaces as an unhandled rejection, and retry works', async () => {
    importGate.fail = 1
    const seen = await unhandledDuring(async () => {
      render(<MapProvider accessToken="pk.widget"><Grabber /><Consumer /></MapProvider>)
      await flush()
    })
    expect(seen).toHaveLength(1)
    // Vitest wraps a throwing mock factory; the original import error is its cause.
    expect(String((seen[0] as Error).cause)).toMatch(/chunk load failed/)
    act(() => { ctx!.acquire({ interactive: true, lightPreset: 'dawn' }) })
    await flush()
    expect(MapCtor).toHaveBeenCalledTimes(1)
  })

  it('without onError, a throwing constructor still surfaces as an unhandled rejection, and retry works', async () => {
    MapCtor.mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    const seen = await unhandledDuring(async () => {
      render(<MapProvider accessToken="pk.widget"><Grabber /><Consumer /></MapProvider>)
      await flush()
    })
    expect(seen).toHaveLength(1)
    expect(String(seen[0])).toMatch(/WebGL unavailable/)
    act(() => { ctx!.acquire({ interactive: true, lightPreset: 'dawn' }) })
    await flush()
    expect(ctx!.getMap()).toBe(mapInstance)
  })

  it('with onError, neither failure leaves an unhandled rejection', async () => {
    importGate.fail = 1
    MapCtor.mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    const onError = vi.fn()
    const seen = await unhandledDuring(async () => {
      render(<MapProvider accessToken="pk.widget" onError={onError}><Grabber /><Consumer /></MapProvider>)
      await flush()
      act(() => { ctx!.acquire({ interactive: true, lightPreset: 'dawn' }) })
      await flush()
    })
    expect(onError.mock.calls).toEqual([['import'], ['construct']])
    expect(seen).toEqual([])
  })

  it('unmounting while the import is pending gives no onError and no map', async () => {
    let release!: () => void
    importGate.hold = new Promise<void>((r) => { release = r })
    importGate.fail = 1
    const onError = vi.fn()
    const view = render(<MapProvider accessToken="pk.widget" onError={onError}><Consumer /></MapProvider>)
    view.unmount()
    importGate.hold = null
    release()
    await flush()
    expect(onError).not.toHaveBeenCalled()
    expect(MapCtor).not.toHaveBeenCalled()
  })
})
