/**
 * Trip Library lifecycle against the real host side of the protocol: ext-apps' AppBridge over the
 * SDK's in-memory transport pair. Nothing in main.tsx is mocked; trip loads are deferred promises
 * so the tests decide the order in which results arrive.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor, within } from '@testing-library/react'
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { McpUiHostCapabilities, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startTripLibrary } from '../main'
import { LIBRARY_ERRORS } from '../state'
import { TRIPS_PAGE_FIXTURE } from '../__fixtures__/trips-page'
import { MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../../src/__fixtures__/multi-source-bundle'
import { renderResult } from '../../src/__tests__/tool-results'
import { availableDayNumbers } from '../../src/day-view'
import { GENERIC_ERROR } from '../../src/tool-result'
import { MAPBOX_TOKEN_META_KEY } from '@/lib/mcp/contract'
import { fire, mapInstance, MapCtor, resetMapbox } from './mapbox-gl-mock'

vi.mock('mapbox-gl', async () => (await import('./mapbox-gl-mock')).mapboxModule)

type ContextUpdate = Parameters<NonNullable<AppBridge['onupdatemodelcontext']>>[0]
type Deferred = { resolve: (r: CallToolResult) => void; reject: (e: Error) => void }
type Host = {
  bridge: AppBridge
  container: HTMLElement
  dispose: () => void
  calls: CallToolRequest['params'][]
  pending: Map<string, Deferred>
  contexts: ContextUpdate[]
}

const A = MULTI_SOURCE_RESPONSE.bundle.trip.id
const B = OTHER_TRIP_RESPONSE.bundle.trip.id
const firstDay = (r: typeof MULTI_SOURCE_RESPONSE) => Math.min(...availableDayNumbers(r.bundle))
const CHATGPT: McpUiHostCapabilities = {
  serverTools: {},
  updateModelContext: { text: {}, structuredContent: {} },
  experimental: { 'openai/modelContext': {} },
}
const page = (structuredContent: typeof TRIPS_PAGE_FIXTURE, token?: string): CallToolResult => ({
  content: [{ type: 'text', text: 'Trips shown.' }],
  structuredContent,
  ...(token === undefined ? {} : { _meta: { [MAPBOX_TOKEN_META_KEY]: token } }),
})

const started: Host[] = []

beforeAll(() => {
  // main.tsx renders from protocol callbacks, outside any act() scope, as it does in a real host.
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
})

afterEach(async () => {
  // The SDK's auto-resize reports on the next animation frame after connect; closing first
  // would turn it into an unhandled "Not connected" rejection.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  for (const { dispose, bridge } of started.splice(0)) {
    dispose()
    await bridge.close()
  }
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
})

/** A few macrotasks: long enough for any in-flight protocol message to land. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

async function startHost({
  hostContext = {},
  capabilities = CHATGPT,
  closeFirst = false,
  token,
}: { hostContext?: McpUiHostContext; capabilities?: McpUiHostCapabilities; closeFirst?: boolean; token?: string } = {}): Promise<Host> {
  const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair()
  const bridge = new AppBridge(null, { name: 'test-host', version: '1' }, capabilities, { hostContext })
  const calls: Host['calls'] = []
  const pending = new Map<string, Deferred>()
  const contexts: ContextUpdate[] = []
  bridge.oncalltool = (params) => {
    calls.push(params)
    return new Promise<CallToolResult>((resolve, reject) => {
      pending.set(String(params.arguments?.trip_id), { resolve, reject })
    })
  }
  bridge.onupdatemodelcontext = async (params) => {
    contexts.push(params)
    return {}
  }
  bridge.oninitialized = () => void bridge.sendToolResult(page(TRIPS_PAGE_FIXTURE, token))
  await bridge.connect(hostTransport)
  if (closeFirst) await hostTransport.close()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const { dispose } = await startTripLibrary(container, appTransport)
  const host = { bridge, container, dispose, calls, pending, contexts }
  started.push(host)
  return host
}

const ui = (host: Host) => within(host.container)

async function tap(host: Host, title: string) {
  ;(await waitFor(() => ui(host).getByRole('button', { name: `Open ${title}` }))).click()
}

async function resolveTrip(host: Host, tripId: string, response: typeof MULTI_SOURCE_RESPONSE) {
  const call = await waitFor(() => {
    const d = host.pending.get(tripId)
    if (!d) throw new Error(`no render_itinerary call for ${tripId} yet`)
    return d
  })
  call.resolve(renderResult(response))
}

async function selectDay(host: Host, day: number) {
  ;(await waitFor(() => ui(host).getByRole('button', { name: new RegExp(`^Day ${day}\\b`) }))).click()
}

const back = async (host: Host) => (await waitFor(() => ui(host).getByRole('button', { name: 'Back to all trips' }))).click()
const heading = (host: Host, name: string) => waitFor(() => expect(ui(host).getByRole('heading', { name })).toBeInTheDocument())

/** True when a click on a non-http link inside the container is cancelled by link delegation. */
function linkDelegated(container: HTMLElement): boolean {
  const anchor = document.createElement('a')
  anchor.setAttribute('href', 'mailto:probe@example.invalid')
  container.appendChild(anchor)
  let prevented = false
  anchor.addEventListener('click', (e) => {
    prevented = e.defaultPrevented
    e.preventDefault()
  })
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  anchor.remove()
  return prevented
}

describe('trip library lifecycle', () => {
  it('renders the trips page sent the instant the handshake completes', async () => {
    const host = await startHost()
    await waitFor(() => expect(ui(host).getByRole('button', { name: 'Open Tokyo in three Reels' })).toBeInTheDocument())
    expect(ui(host).getByRole('button', { name: 'Open Kyoto long weekend' })).toBeInTheDocument()
    // The probe used by the connect-failure case really detects an installed delegation.
    expect(linkDelegated(host.container)).toBe(true)
  })

  it('opens a trip in place and publishes its context once, then once per day change', async () => {
    const host = await startHost()
    await tap(host, 'Tokyo in three Reels')
    await resolveTrip(host, A, MULTI_SOURCE_RESPONSE)
    await heading(host, 'Tokyo, Japan')
    expect(ui(host).getByRole('button', { name: 'Back to all trips' })).toBeInTheDocument()
    expect(host.calls.map(({ name, arguments: args }) => ({ name, args }))).toEqual([{ name: 'render_itinerary', args: { trip_id: A } }])
    await waitFor(() => expect(host.contexts).toHaveLength(1))
    expect(host.contexts[0].structuredContent).toEqual({ trip_id: A, day: firstDay(MULTI_SOURCE_RESPONSE) })
    expect(host.contexts[0].content?.[0]).toMatchObject({ type: 'text' })

    await selectDay(host, 2)
    await waitFor(() => expect(host.contexts).toHaveLength(2))
    expect(host.contexts[1].structuredContent).toEqual({ trip_id: A, day: 2 })
  })

  it('keeps the latest trip when an earlier load resolves late, and publishes nothing for it', async () => {
    const host = await startHost()
    await tap(host, 'Tokyo in three Reels')
    await back(host)
    await tap(host, 'Kyoto long weekend')
    await resolveTrip(host, B, OTHER_TRIP_RESPONSE)
    await heading(host, 'Osaka, Japan')
    await waitFor(() => expect(host.contexts).toHaveLength(1))
    await resolveTrip(host, A, MULTI_SOURCE_RESPONSE)
    await settle()
    expect(ui(host).getByRole('heading', { name: 'Osaka, Japan' })).toBeInTheDocument()
    expect(ui(host).queryByRole('heading', { name: 'Tokyo, Japan' })).toBeNull()
    expect(host.contexts.map((c) => c.structuredContent)).toEqual([{ trip_id: B, day: firstDay(OTHER_TRIP_RESPONSE) }])
  })

  it('stops publishing after the user removes the context, until a fresh trip opens', async () => {
    const ctx: McpUiHostContext = { theme: 'light' }
    const host = await startHost({ hostContext: ctx })
    await tap(host, 'Tokyo in three Reels')
    await resolveTrip(host, A, MULTI_SOURCE_RESPONSE)
    await waitFor(() => expect(host.contexts).toHaveLength(1))

    host.bridge.setHostContext({ ...ctx, 'openai/modelContext': null })
    await settle()
    await selectDay(host, 2)
    await settle()
    expect(host.contexts).toHaveLength(1)

    // An unrelated change must not re-attach the removed context.
    host.bridge.setHostContext({ theme: 'dark' })
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    await selectDay(host, 1)
    await settle()
    expect(host.contexts).toHaveLength(1)

    await back(host)
    await tap(host, 'Kyoto long weekend')
    await resolveTrip(host, B, OTHER_TRIP_RESPONSE)
    await waitFor(() => expect(host.contexts).toHaveLength(2))
    expect(host.contexts[1].structuredContent).toEqual({ trip_id: B, day: firstDay(OTHER_TRIP_RESPONSE) })

    // Unrelated change while attached: the merged host context still holds the old null.
    host.bridge.setHostContext({ theme: 'light' })
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))
    const other = availableDayNumbers(OTHER_TRIP_RESPONSE.bundle).find((d) => d !== firstDay(OTHER_TRIP_RESPONSE))
    if (other === undefined) throw new Error('OTHER_TRIP_RESPONSE needs a second day')
    await selectDay(host, other)
    await waitFor(() => expect(host.contexts).toHaveLength(3))
    expect(host.contexts[2].structuredContent).toEqual({ trip_id: B, day: other })
  })

  it('publishes nothing when the user removes the context while the trip is loading', async () => {
    const host = await startHost()
    await tap(host, 'Tokyo in three Reels')
    await waitFor(() => expect(host.pending.has(A)).toBe(true))
    host.bridge.setHostContext({ 'openai/modelContext': null })
    await settle()
    await resolveTrip(host, A, MULTI_SOURCE_RESPONSE)
    await heading(host, 'Tokyo, Japan')
    await settle()
    expect(host.contexts).toEqual([])
  })

  it('explains, with a way back, when the host cannot call server tools', async () => {
    const host = await startHost({ capabilities: {} })
    await tap(host, 'Tokyo in three Reels')
    await waitFor(() => expect(ui(host).getByText(LIBRARY_ERRORS.noToolCalls)).toBeInTheDocument())
    expect(ui(host).getByRole('button', { name: 'Back to all trips' })).toBeInTheDocument()
    await settle()
    expect(host.calls).toEqual([])
    expect(host.contexts).toEqual([])
  })

  it('shows an error card with a way back when the trip call fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await startHost()
    await tap(host, 'Tokyo in three Reels')
    const call = await waitFor(() => {
      const d = host.pending.get(A)
      if (!d) throw new Error('no call yet')
      return d
    })
    call.reject(new Error('backend down'))
    await waitFor(() => expect(ui(host).getByText(GENERIC_ERROR)).toBeInTheDocument())
    expect(ui(host).getByRole('button', { name: 'Back to all trips' })).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith('[astrail-library] trip load failed')
    expect(host.contexts).toEqual([])
    warn.mockRestore()
  })

  it('renders and sends nothing for a load that resolves after dispose', async () => {
    const host = await startHost()
    await tap(host, 'Tokyo in three Reels')
    await waitFor(() => expect(host.pending.has(A)).toBe(true))
    host.dispose()
    expect(host.container.innerHTML).toBe('')
    await resolveTrip(host, A, MULTI_SOURCE_RESPONSE)
    await settle()
    expect(host.container.innerHTML).toBe('')
    expect(host.contexts).toEqual([])
  })

  it('sends no context to a host without updateModelContext, and text only when that is all it takes', async () => {
    const none = await startHost({ capabilities: { serverTools: {} } })
    await tap(none, 'Tokyo in three Reels')
    await resolveTrip(none, A, MULTI_SOURCE_RESPONSE)
    await heading(none, 'Tokyo, Japan')
    await selectDay(none, 2)
    await settle()
    expect(none.contexts).toEqual([])

    const textOnly = await startHost({ capabilities: { serverTools: {}, updateModelContext: { text: {} } } })
    await tap(textOnly, 'Tokyo in three Reels')
    await resolveTrip(textOnly, A, MULTI_SOURCE_RESPONSE)
    await waitFor(() => expect(textOnly.contexts).toHaveLength(1))
    expect(textOnly.contexts[0].content?.[0]).toMatchObject({ type: 'text' })
    expect(textOnly.contexts[0]).not.toHaveProperty('structuredContent')
  })

  it('shows the connect error, no skeleton and no link handling when connect() fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = await startHost({ closeFirst: true })
    await waitFor(() => expect(ui(host).getByRole('alert')).toHaveTextContent(LIBRARY_ERRORS.connect))
    expect(ui(host).queryByRole('status', { name: 'Loading trips' })).toBeNull()
    expect(linkDelegated(host.container)).toBe(false)
    error.mockRestore()
  })
})

const mapView = (host: Host) => host.container.querySelector('[data-library-map]')
const staticView = (host: Host) => host.container.querySelector('[data-library-detail]')
const sharedMap = (host: Host) => host.container.querySelector('[data-testid="shared-map"]')

async function openTrip(host: Host, title: string, tripId: string, response: typeof MULTI_SOURCE_RESPONSE) {
  await tap(host, title)
  await resolveTrip(host, tripId, response)
}

describe('trip library live map', () => {
  const loseContext = vi.fn()
  let webgl = true

  beforeEach(() => {
    resetMapbox()
    webgl = true
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => (webgl ? { getExtension: () => ({ loseContext }) } : null)) as unknown as HTMLCanvasElement['getContext'],
    )
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('declares the inline and fullscreen display modes at init', async () => {
    const host = await startHost()
    expect(host.bridge.getAppCapabilities()?.availableDisplayModes).toEqual(['inline', 'fullscreen'])
  })

  it('opens a trip on the live map with a pk. token and WebGL, after releasing the probe context', async () => {
    const host = await startHost({ token: 'pk.test' })
    await openTrip(host, 'Tokyo in three Reels', A, MULTI_SOURCE_RESPONSE)
    await waitFor(() => expect(mapView(host)).not.toBeNull())
    expect(staticView(host)).toBeNull()
    expect(ui(host).getByRole('heading', { name: 'Tokyo in three Reels' })).toBeInTheDocument()
    expect(loseContext).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(MapCtor).toHaveBeenCalledTimes(1))
    // pushContext is unchanged: the opening day is published once.
    await waitFor(() => expect(host.contexts).toHaveLength(1))
    expect(host.contexts[0].structuredContent).toEqual({ trip_id: A, day: firstDay(MULTI_SOURCE_RESPONSE) })
  })

  it('A -> Back -> B: back returns to the list, and one map serves both trips', async () => {
    const host = await startHost({ token: 'pk.test' })
    await openTrip(host, 'Tokyo in three Reels', A, MULTI_SOURCE_RESPONSE)
    await waitFor(() => expect(MapCtor).toHaveBeenCalledTimes(1))
    fire('load')
    await back(host)
    await waitFor(() => expect(ui(host).getByRole('heading', { name: 'Your trips' })).toBeInTheDocument())
    await openTrip(host, 'Kyoto long weekend', B, OTHER_TRIP_RESPONSE)
    await waitFor(() => expect(ui(host).getByRole('heading', { name: 'Another trip' })).toBeInTheDocument())
    expect(mapView(host)).not.toBeNull()
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(mapInstance.remove).not.toHaveBeenCalled()
  })

  it('keeps the static view without a pk. token, without WebGL, or for a zero-day trip', async () => {
    const zeroDay = { ...MULTI_SOURCE_RESPONSE, bundle: { ...MULTI_SOURCE_RESPONSE.bundle, days: [] } }
    const cases = [
      { name: 'no token', token: undefined, gl: true, response: MULTI_SOURCE_RESPONSE, provider: false },
      { name: 'secret token', token: 'sk.secret', gl: true, response: MULTI_SOURCE_RESPONSE, provider: false },
      { name: 'no WebGL', token: 'pk.test', gl: false, response: MULTI_SOURCE_RESPONSE, provider: false },
      { name: 'zero days', token: 'pk.test', gl: true, response: zeroDay, provider: true },
    ]
    for (const c of cases) {
      webgl = c.gl
      const host = await startHost({ token: c.token })
      await openTrip(host, 'Tokyo in three Reels', A, c.response)
      await waitFor(() => expect(staticView(host), c.name).not.toBeNull())
      expect(mapView(host), c.name).toBeNull()
      expect(sharedMap(host) !== null, c.name).toBe(c.provider)
      host.dispose()
    }
    await settle()
    expect(MapCtor).not.toHaveBeenCalled()
  })

  it('a map error latches: the provider unmounts (one remove) and every later trip is static', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await startHost({ token: 'pk.test' })
    await openTrip(host, 'Tokyo in three Reels', A, MULTI_SOURCE_RESPONSE)
    await waitFor(() => expect(MapCtor).toHaveBeenCalledTimes(1))
    fire('error', { error: new Error('style blocked') })
    await waitFor(() => expect(staticView(host)).not.toBeNull())
    expect(mapView(host)).toBeNull()
    expect(sharedMap(host)).toBeNull()
    expect(mapInstance.remove).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[astrail-library] map unavailable, showing the static view')

    await back(host)
    await openTrip(host, 'Kyoto long weekend', B, OTHER_TRIP_RESPONSE)
    await heading(host, 'Osaka, Japan')
    expect(staticView(host)).not.toBeNull()
    expect(mapView(host)).toBeNull()
    expect(MapCtor).toHaveBeenCalledTimes(1)
    expect(mapInstance.remove).toHaveBeenCalledTimes(1)
  })

  it('re-measures (window resize) after new host safe-area insets are applied, and only then', async () => {
    const host = await startHost()
    const seen: string[] = []
    const onResize = () => seen.push(document.documentElement.style.getPropertyValue('--safe-top'))
    window.addEventListener('resize', onResize)
    try {
      host.bridge.setHostContext({ theme: 'dark' })
      await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
      expect(seen).toEqual([])
      host.bridge.setHostContext({ theme: 'dark', safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 } })
      await waitFor(() => expect(seen).toEqual(['47px']))
    } finally {
      window.removeEventListener('resize', onResize)
    }
  })
})
