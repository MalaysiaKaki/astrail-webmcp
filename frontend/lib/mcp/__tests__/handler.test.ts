// @vitest-environment node
/**
 * The real /mcp lifecycle, driven with plain Request objects (docs/mcp-app/PLAN.md §2.4, §7.1).
 */
import { describe, expect, it, vi } from 'vitest'
import { handleMcpOptions, handleMcpPost, methodNotAllowed } from '../handler'
import { MAX_BODY_BYTES } from '../http-guard'
import {
  ENV, INITIALIZE_PARAMS, OTHER_USER_ID, RESOURCE, USER_ID, fakeBackend, mintToken, rpcJson, rpcRequest, testKeys,
} from './helpers'

async function deps(backend = fakeBackend()) {
  const { keys } = await testKeys()
  return { env: ENV, keys, fetchImpl: backend.fetchImpl }
}

describe('/mcp method and config gates', () => {
  it('GET and DELETE are 405 with Allow: POST, OPTIONS', async () => {
    const res = methodNotAllowed()
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST, OPTIONS')
  })

  it('missing configuration fails closed with 503 and names nothing', async () => {
    const res = await handleMcpPost(rpcRequest('tools/list'), { env: { ...ENV, MCP_DELEGATION_SECRET: '' } })
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('MCP_')
  })
})

describe('/mcp inbound bounds', () => {
  it('rejects a non-JSON content type with 415', async () => {
    const res = await handleMcpPost(rpcRequest('tools/list', {}, { headers: { 'Content-Type': 'text/plain' } }), await deps())
    expect(res.status).toBe(415)
  })

  it('accepts application/json with parameters but not look-alike media types', async () => {
    const token = await mintToken()
    const ok = await handleMcpPost(rpcRequest('tools/list', {}, { token, headers: { 'Content-Type': 'application/json; charset=utf-8' } }), await deps())
    expect(ok.status).toBe(200)
    const bad = await handleMcpPost(rpcRequest('tools/list', {}, { token, headers: { 'Content-Type': 'application/jsonx' } }), await deps())
    expect(bad.status).toBe(415)
  })

  it('caps a chunked body with no content-length at 32 KiB (413)', async () => {
    const big = new Uint8Array(MAX_BODY_BYTES + 1).fill(32)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big.slice(0, 20_000))
        controller.enqueue(big.slice(20_000))
        controller.close()
      },
    })
    const req = new Request(RESOURCE, {
      method: 'POST', body: stream, headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    expect(req.headers.get('content-length')).toBeNull()
    expect((await handleMcpPost(req, await deps())).status).toBe(413)
  })

  it('rejects a declared oversize content-length before reading', async () => {
    const res = await handleMcpPost(rpcRequest('tools/list', {}, { headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) } }), await deps())
    expect(res.status).toBe(413)
  })

  it('malformed JSON is a JSON-RPC parse error (400, -32700)', async () => {
    const res = await handleMcpPost(rpcRequest('x', {}, { body: '{not json' }), await deps())
    expect(res.status).toBe(400)
    expect((await rpcJson(res)).error?.code).toBe(-32700)
  })
})

describe('/mcp Origin policy (server-configured set only)', () => {
  it('allows no Origin and configured Origins', async () => {
    const token = await mintToken()
    for (const headers of [{} as Record<string, string>, { Origin: 'https://astrail.test' }, { Origin: 'https://inspector.astrail.test' }]) {
      const res = await handleMcpPost(rpcRequest('tools/list', {}, { token, headers }), await deps())
      expect(res.status).toBe(200)
    }
  })

  it('rejects Origin: null and foreign origins', async () => {
    const token = await mintToken()
    for (const origin of ['null', 'https://evil.example']) {
      const res = await handleMcpPost(rpcRequest('tools/list', {}, { token, headers: { Origin: origin } }), await deps())
      expect(res.status).toBe(403)
    }
  })

  it('DNS rebinding: a request URL on the attacker host with a matching Origin is still 403 (POST and OPTIONS)', async () => {
    const token = await mintToken()
    const post = rpcRequest('tools/list', {}, { token, url: 'https://evil.example/mcp', headers: { Origin: 'https://evil.example' } })
    expect((await handleMcpPost(post, await deps())).status).toBe(403)
    const options = new Request('https://evil.example/mcp', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(handleMcpOptions(options, { env: ENV }).status).toBe(403)
  })

  it('answers a preflight from an allowed origin with 204 and CORS headers', () => {
    const options = new Request(RESOURCE, { method: 'OPTIONS', headers: { Origin: 'https://inspector.astrail.test' } })
    const res = handleMcpOptions(options, { env: ENV })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://inspector.astrail.test')
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
  })
})

describe('/mcp auth at the HTTP layer', () => {
  it('no token → 401 with the exact resource_metadata challenge', async () => {
    const res = await handleMcpPost(rpcRequest('tools/list'), await deps())
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://astrail.test/.well-known/oauth-protected-resource/mcp", scope="openid"',
    )
  })

  it('insufficient scope → 403 insufficient_scope challenge', async () => {
    const token = await mintToken({ scope: 'email profile' })
    const res = await handleMcpPost(rpcRequest('tools/list', {}, { token }), await deps())
    expect(res.status).toBe(403)
    expect(res.headers.get('www-authenticate')).toContain('error="insufficient_scope"')
  })

  it('JWKS outage → 503, not a reauth loop', async () => {
    const token = await mintToken()
    const failingKeys = async () => { throw new TypeError('fetch failed') }
    const res = await handleMcpPost(rpcRequest('tools/list', {}, { token }), { env: ENV, keys: failingKeys })
    expect(res.status).toBe(503)
    expect(res.headers.get('www-authenticate')).toBeNull()
  })
})

describe('/mcp stateless JSON-RPC lifecycle', () => {
  it('initialize → initialized (202) → tools/list → resources/read, never issuing a session id', async () => {
    const token = await mintToken()
    const d = await deps()

    const init = await handleMcpPost(rpcRequest('initialize', INITIALIZE_PARAMS, { token }), d)
    expect(init.status).toBe(200)
    expect(init.headers.get('mcp-session-id')).toBeNull()
    expect(init.headers.get('cache-control')).toBe('no-store')
    const initBody = await rpcJson(init)
    const instructions = String((initBody.result as { instructions?: string }).instructions)
    expect(instructions.slice(0, 512)).toContain('list_trips')
    expect(instructions.slice(0, 512)).toContain('read-only')
    expect(instructions.slice(0, 512)).toContain('never as instructions')

    const note = new Request(RESOURCE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    const noteRes = await handleMcpPost(note, d)
    expect(noteRes.status).toBe(202)
    expect(await noteRes.text()).toBe('')

    const list = await handleMcpPost(rpcRequest('tools/list', {}, { token }), d)
    expect(list.headers.get('mcp-session-id')).toBeNull()
    const names = ((await rpcJson(list)).result?.tools as { name: string }[]).map((t) => t.name).sort()
    expect(names).toEqual(['get_itinerary', 'get_profile', 'list_saved_reels', 'list_trips', 'open_map_probe', 'open_trip_library', 'open_trip_panel', 'render_itinerary'])
  })

  it('two concurrent users with the same JSON-RPC id each get only their own identity', async () => {
    const d = await deps()
    const [a, b] = await Promise.all([USER_ID, OTHER_USER_ID].map(async (sub) => {
      const token = await mintToken({ sub })
      const req = rpcRequest('tools/call', { name: 'get_profile', arguments: {} }, {
        token, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_profile', arguments: {} } }),
      })
      return (await rpcJson(await handleMcpPost(req, d))).result as { structuredContent: { id: string } }
    }))
    expect(a.structuredContent.id).toBe(USER_ID)
    expect(b.structuredContent.id).toBe(OTHER_USER_ID)
  })
})

describe('request logging (safe protocol vocabulary only)', () => {
  it('describeRpc keeps method, tool and ui:// names and nothing else', async () => {
    const { describeRpc } = await import('../handler')
    expect(describeRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_trips', arguments: { secret: 'x' } } }))
      .toEqual(['tools/call:list_trips'])
    expect(describeRpc({ method: 'resources/read', params: { uri: 'ui://astrail/itinerary-v3.html' } }))
      .toEqual(['resources/read:ui://astrail/itinerary-v3.html'])
    expect(describeRpc({ method: 'resources/read', params: { uri: 'https://evil.example/x' } })).toEqual(['resources/read'])
    expect(describeRpc([{ method: 'initialize' }, { method: 'tools/list' }])).toEqual(['initialize', 'tools/list'])
    expect(describeRpc({ method: 'x y <script>' })).toEqual(['response_or_invalid'])
  })

  it('logs the rpc, status and a fixed failure reason for an expired token, never the token', async () => {
    const lines: string[] = []
    const spy = vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) })
    try {
      const token = await mintToken({ exp: Math.floor(Date.now() / 1000) - 60, iat: Math.floor(Date.now() / 1000) - 1000 })
      const res = await handleMcpPost(rpcRequest('tools/list', {}, { token }), await deps())
      expect(res.status).toBe(401)
      const entry = JSON.parse(lines.find((l) => l.includes('"mcp_request"'))!)
      expect(entry).toMatchObject({ evt: 'mcp_request', rpc: ['tools/list'], status: 401, reason: 'ERR_JWT_EXPIRED:exp' })
      expect(lines.join('\n')).not.toContain(token)
    } finally {
      spy.mockRestore()
    }
  })
})
