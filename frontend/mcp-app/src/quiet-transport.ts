/**
 * postMessage transport to the host, WITHOUT payload logging.
 *
 * ext-apps' default PostMessageTransport console.debug()s every parsed and sent JSON-RPC message.
 * For this widget a tool-result message carries the user's whole trip bundle, so that would put
 * private itinerary data in the browser console (security requirement 8). This mirrors its
 * behaviour — only accept messages from the parent window, schema-validate, forward — and logs
 * nothing but fixed strings.
 */
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

export class QuietPostMessageTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  private readonly listener = (event: MessageEvent) => {
    if (event.source !== this.source) return
    const parsed = JSONRPCMessageSchema.safeParse(event.data)
    if (parsed.success) {
      this.onmessage?.(parsed.data)
      return
    }
    // Not ours (e.g. another script's postMessage): ignore silently. Malformed JSON-RPC: report a
    // fixed error, never the message itself.
    const data: unknown = event.data
    if (data && typeof data === 'object' && (data as { jsonrpc?: unknown }).jsonrpc === '2.0') {
      this.onerror?.(new Error('Invalid JSON-RPC message received from the host.'))
    }
  }

  constructor(
    private readonly target: Window = window.parent,
    private readonly source: MessageEventSource | null = window.parent,
  ) {}

  async start(): Promise<void> {
    window.addEventListener('message', this.listener)
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.target.postMessage(message, '*')
  }

  async close(): Promise<void> {
    window.removeEventListener('message', this.listener)
    this.onclose?.()
  }
}
