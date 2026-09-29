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

export async function handleMcpPost(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  const config = configOrNull(deps)
  if (!config) return misconfigured()

  const guarded = await guardPost(req, config)
  if (!guarded.ok) return guarded.response
  const cors = corsHeaders(req)

  const verified = await verifyMcpRequest(req, config, deps.keys)
  if (!verified.ok) {
    const { status, challenge } = verified.failure
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
