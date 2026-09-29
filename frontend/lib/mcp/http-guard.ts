/**
 * Inbound HTTP bounds for /mcp (docs/mcp-app/PLAN.md §2.4 step 2, requirement 6).
 *
 * The body is read exactly ONCE, here, under a streamed byte cap, and handed to the SDK transport
 * as `parsedBody`. Passing `parsedBody` bypasses the SDK's own size cap, so this is the only one.
 */
import type { McpConfig } from './config'

export const MAX_BODY_BYTES = 32 * 1024
export const ALLOW_HEADER = 'POST, OPTIONS'

const CORS_ALLOW_HEADERS = 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Last-Event-ID'
const CORS_EXPOSE_HEADERS = 'WWW-Authenticate, Mcp-Protocol-Version'

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/** JSON-RPC error body for failures that happen before the SDK sees the message. */
export function jsonRpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return jsonResponse(status, { jsonrpc: '2.0', id: null, error: { code, message } }, headers)
}

export function methodNotAllowed(): Response {
  return jsonRpcError(405, -32000, 'Method not allowed.', { Allow: ALLOW_HEADER })
}

/**
 * Absent Origin = a native client (ChatGPT's servers, Inspector's proxy): allowed. A present
 * Origin must be in the server-configured set — never compared with the request's own URL, Host or
 * forwarded headers, which an attacker-controlled hostname would satisfy (DNS rebinding).
 * `Origin: null` is not in the set, so it is rejected.
 */
export function originAllowed(req: Request, config: McpConfig): boolean {
  const origin = req.headers.get('origin')
  return origin === null || config.allowedOrigins.has(origin)
}

/** CORS headers for an allowed browser Origin; empty for native clients. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': CORS_EXPOSE_HEADERS,
    Vary: 'Origin',
  }
}

export function preflight(req: Request, config: McpConfig): Response {
  if (!originAllowed(req, config)) return jsonRpcError(403, -32000, 'Origin not allowed.')
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': ALLOW_HEADER,
      'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
      'Access-Control-Max-Age': '600',
      Allow: ALLOW_HEADER,
    },
  })
}

function isJsonMediaType(value: string | null): boolean {
  if (!value) return false
  const mediaType = value.split(';', 1)[0].trim().toLowerCase()
  return mediaType === 'application/json'
}

type ReadResult = { ok: true; bytes: Uint8Array } | { ok: false; tooLarge: true }

/** Stream the body with a hard cap, so a chunked body with no Content-Length is bounded too. */
async function readCapped(req: Request, limit: number): Promise<ReadResult> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return { ok: false, tooLarge: true }
  if (!req.body) return { ok: true, bytes: new Uint8Array() }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, tooLarge: true }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes }
}

export type GuardResult = { ok: true; parsedBody: unknown } | { ok: false; response: Response }

/** Origin → media type → capped read → JSON parse. Method dispatch happens in the route. */
export async function guardPost(req: Request, config: McpConfig): Promise<GuardResult> {
  if (!originAllowed(req, config)) {
    return { ok: false, response: jsonRpcError(403, -32000, 'Origin not allowed.') }
  }
  const cors = corsHeaders(req)
  if (!isJsonMediaType(req.headers.get('content-type'))) {
    return { ok: false, response: jsonRpcError(415, -32000, 'Content-Type must be application/json.', cors) }
  }
  const read = await readCapped(req, MAX_BODY_BYTES)
  if (!read.ok) {
    return { ok: false, response: jsonRpcError(413, -32000, 'Request body too large.', cors) }
  }
  try {
    return { ok: true, parsedBody: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes)) }
  } catch {
    return { ok: false, response: jsonRpcError(400, -32700, 'Parse error.', cors) }
  }
}
