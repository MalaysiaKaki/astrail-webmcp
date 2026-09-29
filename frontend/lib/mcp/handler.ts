/**
 * The /mcp request lifecycle (docs/mcp-app/PLAN.md §2.4), kept out of the route file so tests can
 * drive it with plain Request objects and an injected key set / fetch.
 *
 * config → guard (origin, media type, capped body, JSON) → bearer verification → a FRESH server and
 * stateless transport → handle with the pre-parsed body → close both, always.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { verifyMcpRequest, type KeyResolver } from './auth'
import { loadMcpConfig, type McpConfig } from './config'
import { corsHeaders, guardPost, jsonResponse, methodNotAllowed, preflight } from './http-guard'
import { createAstrailMcpServer } from './server'

export type HandlerDeps = { env?: Record<string, string | undefined>; keys?: KeyResolver; fetchImpl?: typeof fetch }

function misconfigured(): Response {
  // Which variable is missing is an operator concern; the client only learns that it is our fault.
  return jsonResponse(503, { error: 'server_misconfigured' })
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res)
  for (const [key, value] of Object.entries(headers)) out.headers.set(key, value)
  return out
}

function configOrNull(deps: HandlerDeps): McpConfig | null {
  const loaded = loadMcpConfig(deps.env ?? process.env)
  if (!loaded.ok) {
    console.error(JSON.stringify({ evt: 'mcp_config_invalid', problems: loaded.problems }))
    return null
  }
  return loaded.config
}

const SAFE_TOKEN = /^[A-Za-z0-9_/.:-]{1,64}$/

/**
 * What a request asked for, reduced to protocol vocabulary only: JSON-RPC method names, tool
 * names and ui:// resource URIs — all chosen by us or the spec, never user data or tokens. Lets a
 * deployed server's logs say "resources/read → 401 exp" instead of just "POST /mcp 401".
 */
export function describeRpc(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body]
  return messages.slice(0, 10).map((m) => {
    if (!m || typeof m !== 'object') return 'invalid'
    const { method, params } = m as { method?: unknown; params?: { name?: unknown; uri?: unknown } }
    if (typeof method !== 'string' || !SAFE_TOKEN.test(method)) return 'response_or_invalid'
    const name = params?.name
    if (method === 'tools/call' && typeof name === 'string' && SAFE_TOKEN.test(name)) return `${method}:${name}`
    const uri = params?.uri
    if (method === 'resources/read' && typeof uri === 'string' && uri.startsWith('ui://') && SAFE_TOKEN.test(uri)) return `${method}:${uri}`
    return method
  })
}

function logRequest(rpc: string[], status: number, startedAt: number, reason?: string): void {
  console.info(JSON.stringify({ evt: 'mcp_request', rpc, status, ...(reason ? { reason } : {}), ms: Date.now() - startedAt }))
}

export async function handleMcpPost(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const startedAt = Date.now()
  const config = configOrNull(deps)
  if (!config) return misconfigured()

  const guarded = await guardPost(req, config)
  if (!guarded.ok) {
    logRequest([], guarded.response.status, startedAt, 'guard')
    return guarded.response
  }
  const cors = corsHeaders(req)
  const rpc = describeRpc(guarded.parsedBody)

  const verified = await verifyMcpRequest(req, config, deps.keys)
  if (!verified.ok) {
    const { status, challenge, reason } = verified.failure
    // `reason` is one of auth.ts's fixed codes (e.g. exp, audience, client_not_allowed) — never token content.
    logRequest(rpc, status, startedAt, reason)
    if (status === 503) return jsonResponse(503, { error: 'auth_unavailable' }, cors)
    return jsonResponse(status, { error: status === 403 ? 'insufficient_scope' : 'unauthorized' }, {
      ...cors,
      ...(challenge ? { 'WWW-Authenticate': challenge } : {}),
    })
  }

  const server = createAstrailMcpServer({ config, auth: verified.auth, fetchImpl: deps.fetchImpl })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    const res = await transport.handleRequest(req, { parsedBody: guarded.parsedBody })
    logRequest(rpc, res.status, startedAt)
    return withHeaders(res, { ...cors, 'Cache-Control': 'no-store' })
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

export function handleMcpOptions(req: Request, deps: HandlerDeps = {}): Response {
  const config = configOrNull(deps)
  return config ? preflight(req, config) : misconfigured()
}

export { methodNotAllowed }
