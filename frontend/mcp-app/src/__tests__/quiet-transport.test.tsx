/**
 * Security requirement 8 on the PRODUCTION postMessage path (Codex code review C1): a real App over
 * the widget's own transport, a host simulated with real MessageEvents, and every console method
 * spied. The private bundle must render and must never reach the console.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { App } from '@modelcontextprotocol/ext-apps'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { startItineraryWidget, type StartedWidget } from '../main'
import { QuietPostMessageTransport } from '../quiet-transport'
import { MULTI_SOURCE_RESPONSE } from '../__fixtures__/multi-source-bundle'
import { renderResult } from './tool-results'

const LEVELS = ['log', 'debug', 'info', 'warn', 'error', 'trace'] as const
const started: StartedWidget[] = []

beforeAll(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
})

afterEach(() => {
  for (const w of started.splice(0)) w.dispose()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function spyConsole(): string[] {
  const lines: string[] = []
  for (const level of LEVELS) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '))
    })
  }
  return lines
}

/** A fake host window: answers ui/initialize and records what the widget sends. */
function fakeHost() {
  const sent: JSONRPCMessage[] = []
  const deliver = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: window }))
  const target = {
    postMessage: (message: JSONRPCMessage) => {
      sent.push(message)
      if ('method' in message && message.method === 'ui/initialize' && 'id' in message) {
        queueMicrotask(() => deliver({
          jsonrpc: '2.0',
          id: message.id,
          result: { protocolVersion: '2026-01-26', hostInfo: { name: 'fake', version: '1' }, hostCapabilities: {}, hostContext: {} },
        }))
      }
    },
  }
  return { sent, deliver, target: target as unknown as Window }
}

describe('QuietPostMessageTransport', () => {
  it('renders a private tool result without printing any of it', async () => {
    const lines = spyConsole()
    const host = fakeHost()
    const container = document.createElement('div')
    document.body.appendChild(container)
    started.push(await startItineraryWidget(container, new QuietPostMessageTransport(host.target, window)))

    host.deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: renderResult(MULTI_SOURCE_RESPONSE) })
    const title = MULTI_SOURCE_RESPONSE.bundle.trip.title!
    await waitFor(() => expect(screen.getAllByText(title).length).toBeGreaterThan(0))

    const printed = lines.join('\n')
    const sentinels = [title, MULTI_SOURCE_RESPONSE.bundle.trip.id, ...MULTI_SOURCE_RESPONSE.bundle.places.map((p) => p.place.name)]
    for (const s of sentinels) expect(printed).not.toContain(s)
  })

  it('ignores messages from other windows and reports malformed JSON-RPC with a fixed error only', async () => {
    const lines = spyConsole()
    const other = {} as MessageEventSource
    const transport = new QuietPostMessageTransport({ postMessage: vi.fn() } as unknown as Window, other)
    const onmessage = vi.fn()
    const onerror = vi.fn()
    transport.onmessage = onmessage
    transport.onerror = onerror
    await transport.start()

    window.dispatchEvent(new MessageEvent('message', { data: { jsonrpc: '2.0', method: 'x', params: { secret: 'S1' } }, source: window }))
    expect(onmessage).not.toHaveBeenCalled()

    const fromHost = (data: unknown) => {
      const event = new MessageEvent('message', { data })
      Object.defineProperty(event, 'source', { value: other })
      window.dispatchEvent(event)
    }
    fromHost({ jsonrpc: '2.0', bogus: 'SECRET_PAYLOAD' })
    expect(onerror).toHaveBeenCalledTimes(1)
    expect(String(onerror.mock.calls[0][0])).not.toContain('SECRET_PAYLOAD')
    fromHost('not json-rpc')
    expect(onerror).toHaveBeenCalledTimes(1)
    await transport.close()
    expect(lines.join('\n')).not.toMatch(/S1|SECRET_PAYLOAD/)
  })

  it('is what production uses when no transport is injected', async () => {
    const connect = vi.spyOn(App.prototype, 'connect').mockRejectedValue(new Error('no host in test'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.appendChild(container)
    started.push(await startItineraryWidget(container))
    expect(connect.mock.calls[0][0]).toBeInstanceOf(QuietPostMessageTransport)
  })
})
