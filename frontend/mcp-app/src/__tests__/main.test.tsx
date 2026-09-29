/**
 * The real App lifecycle against the real host side of the protocol: ext-apps' AppBridge over the
 * SDK's in-memory transport pair. Nothing in main.tsx is mocked.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { McpUiHostCapabilities, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startItineraryWidget, type StartedWidget } from '../main'
import { FIXTURE_IDS, MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../__fixtures__/multi-source-bundle'
import { fixtureLinks, renderResult } from './tool-results'

type Host = { bridge: AppBridge; container: HTMLElement; widget: StartedWidget }

const started: Host[] = []

beforeAll(() => {
  // main.tsx renders from protocol callbacks, outside any act() scope, as it does in a real host.
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
})

afterEach(async () => {
  // The SDK's auto-resize sends its first size report on the next animation frame after connect;
  // closing the host before that frame turns it into an unhandled "Not connected" rejection.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  for (const { widget, bridge } of started.splice(0)) {
    widget.dispose()
    await bridge.close()
  }
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
})

async function startHost({
  hostContext = {},
  capabilities = {},
  onInitialized,
}: {
  hostContext?: McpUiHostContext
  capabilities?: McpUiHostCapabilities
  onInitialized?: (bridge: AppBridge) => void
} = {}): Promise<Host> {
  const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair()
  const bridge = new AppBridge(null, { name: 'test-host', version: '1' }, capabilities, { hostContext })
  if (onInitialized) bridge.oninitialized = () => onInitialized(bridge)
  await bridge.connect(hostTransport)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = await startItineraryWidget(container, appTransport)
  const host = { bridge, container, widget }
  started.push(host)
  return host
}

describe('itinerary widget lifecycle', () => {
  it('applies the INITIAL host context (dark theme, safe area) without any change notification', async () => {
    const contextChanged = vi.spyOn(AppBridge.prototype, 'sendHostContextChange')
    await startHost({
      hostContext: {
        theme: 'dark',
        safeAreaInsets: { top: 44, right: 0, bottom: 34, left: 0 },
        styles: { css: { fonts: '@font-face { font-family: HostSans; src: local(Arial); }' } },
      },
    })
    expect(contextChanged).not.toHaveBeenCalled()
    const root = document.documentElement
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.style.getPropertyValue('--safe-top')).toBe('44px')
    expect(root.style.getPropertyValue('--safe-bottom')).toBe('34px')
    expect(document.getElementById('__mcp-host-fonts')?.textContent).toContain('HostSans')
    contextChanged.mockRestore()
  })

  it('re-applies the merged context on host-context-changed', async () => {
    const { bridge } = await startHost({ hostContext: { theme: 'light', safeAreaInsets: { top: 10, right: 0, bottom: 0, left: 0 } } })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    bridge.setHostContext({ theme: 'dark', safeAreaInsets: { top: 10, right: 0, bottom: 0, left: 0 } })
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('10px')
  })

  it('catches input and result sent the instant the handshake completes (handlers precede connect)', async () => {
    const { container } = await startHost({
      onInitialized: (bridge) => {
        void bridge.sendToolInput({ arguments: { trip_id: MULTI_SOURCE_RESPONSE.bundle.trip.id } })
        void bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE, 2))
      },
    })
    await waitFor(() => expect(within(container).getByRole('heading', { name: 'Tokyo, Japan' })).toBeInTheDocument())
    expect(within(container).getByRole('button', { name: /^Day 2\b/ })).toHaveAttribute('aria-current', 'true')
  })

  it('shows loading on tool input, then the error text for an isError result', async () => {
    const { bridge, container } = await startHost()
    await bridge.sendToolInput({ arguments: {} })
    await waitFor(() => expect(within(container).getByRole('status', { name: 'Loading itinerary' })).toBeInTheDocument())
    await bridge.sendToolResult({ isError: true, content: [{ type: 'text', text: 'No trip with that id in your account.' }] })
    await waitFor(() => expect(within(container).getByText('No trip with that id in your account.')).toBeInTheDocument())
  })

  it('shows the fallback for a malformed result, and the cancelled state on cancel', async () => {
    const { bridge, container } = await startHost()
    await bridge.sendToolResult({ content: [], structuredContent: { nope: true } })
    await waitFor(() => expect(within(container).getByText("Couldn't display this itinerary")).toBeInTheDocument())
    await bridge.sendToolCancelled({ reason: 'user action' })
    await waitFor(() => expect(within(container).getByText('Itinerary request cancelled')).toBeInTheDocument())
  })

  it('routes an evidence link click to ui/open-link when the host supports it', async () => {
    const opened: string[] = []
    const { bridge, container } = await startHost({ capabilities: { openLinks: {} } })
    bridge.onopenlink = async ({ url }) => {
      opened.push(url)
      return {}
    }
    await bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE))
    // The day's first place to eat is anchored to Sensō-ji: its Evidence link is in that card's detail.
    const card = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`[data-place-id="${FIXTURE_IDS.placeSensoji}"]`)
      if (!el) throw new Error('Sensō-ji card not rendered yet')
      return el
    })
    card.click()
    const link = await waitFor(() => within(container).getByRole('link', { name: /^Evidence/ }))
    link.click()
    await waitFor(() => expect(opened).toEqual(['https://www.asakusaimahan.co.jp/']))
  })

  it('routes "Open in Astrail" and a tap on the day map through ui/open-link', async () => {
    const opened: string[] = []
    const { bridge, container } = await startHost({ capabilities: { openLinks: {} } })
    bridge.onopenlink = async ({ url }) => {
      opened.push(url)
      return {}
    }
    await bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE, null, fixtureLinks(FIXTURE_IDS.trip)))
    const open = await waitFor(() => within(container).getByRole('link', { name: /Open in Astrail/ }))
    open.click()
    within(container).getByRole('img', { name: 'Route map for Day 1' }).click()
    const tripUrl = `https://astrail.test/app/trip/${FIXTURE_IDS.trip}`
    await waitFor(() => expect(opened).toEqual([tripUrl, tripUrl]))
  })

  it('offers fullscreen only when the host lists it', async () => {
    const { bridge, container } = await startHost({ hostContext: { availableDisplayModes: ['inline', 'fullscreen'], displayMode: 'inline' } })
    await bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE))
    await waitFor(() => expect(within(container).getByRole('button', { name: 'Expand' })).toBeInTheDocument())

    const other = await startHost({ hostContext: { availableDisplayModes: ['inline'] } })
    await other.bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE))
    await waitFor(() => expect(within(other.container).getByRole('heading', { name: 'Tokyo, Japan' })).toBeInTheDocument())
    expect(within(other.container).queryByRole('button', { name: 'Expand' })).toBeNull()
  })

  it('keeps two widget instances independent', async () => {
    const a = await startHost()
    const b = await startHost()
    await a.bridge.sendToolResult(renderResult(MULTI_SOURCE_RESPONSE))
    await b.bridge.sendToolResult(renderResult(OTHER_TRIP_RESPONSE, 3))
    await waitFor(() => expect(within(b.container).getByRole('heading', { name: 'Osaka, Japan' })).toBeInTheDocument())
    await waitFor(() => expect(within(a.container).getByRole('heading', { name: 'Tokyo, Japan' })).toBeInTheDocument())
    expect(within(a.container).getByRole('button', { name: /^Day 1\b/ })).toHaveAttribute('aria-current', 'true')
    expect(within(b.container).getByRole('button', { name: /^Day 3\b/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getAllByRole('group', { name: 'Trip days' })).toHaveLength(2)
  })
})
