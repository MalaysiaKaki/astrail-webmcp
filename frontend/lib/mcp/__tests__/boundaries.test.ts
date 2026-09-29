// @vitest-environment node
/**
 * Config, delegation, upstream bounds, metadata, privacy and module boundaries
 * (docs/mcp-app/PLAN.md §2.3, §3, §7.1).
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { decodeJwt } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpAuth } from '../auth'
import { loadMcpConfig, type McpConfig } from '../config'
import { tripsPageSchema } from '../contract'
import { bodyHash, signDelegation } from '../delegation'
import { handleMcpPost } from '../handler'
import { protectedResourceMetadata } from '../resource-metadata'
import { BACKEND_PATHS, UPSTREAM_MAX_BYTES, callBackend } from '../upstream'
import { BACKEND, CLIENT_ID, ENV, USER_ID, fakeBackend, mintToken, nowS, rpcRequest, testKeys } from './helpers'

const FRONTEND = join(__dirname, '..', '..', '..')

function config(env = ENV): McpConfig {
  const loaded = loadMcpConfig(env)
  if (!loaded.ok) throw new Error(`config invalid: ${loaded.problems.join(',')}`)
  return loaded.config
}

const auth = (overrides: Partial<McpAuth> = {}): McpAuth => ({ userId: USER_ID, clientId: CLIENT_ID, expiresAt: nowS() + 3600, ...overrides })

describe('loadMcpConfig', () => {
  it('derives the metadata URL and the allowed-origin set from the resource only', () => {
    const c = config()
    expect(c.metadataUrl).toBe('https://astrail.test/.well-known/oauth-protected-resource/mcp')
    expect([...c.allowedOrigins].sort()).toEqual(['https://astrail.test', 'https://inspector.astrail.test'])
  })

  it.each([
    ['MCP_RESOURCE_URL', 'http://astrail.test/mcp'],
    ['MCP_RESOURCE_URL', 'https://astrail.test/other'],
    ['MCP_BACKEND_ORIGIN', 'https://api.astrail.test/path'],
    ['MCP_BACKEND_ORIGIN', 'https://user:pw@api.astrail.test'],
    ['MCP_DELEGATION_SECRET', Buffer.alloc(32, 1).toString('base64')],
    ['MCP_ALLOWED_CLIENT_IDS', 'chatgpt'],
    ['MCP_ALLOWED_CLIENT_IDS', ''],
    ['MCP_ALLOWED_ORIGINS', 'not a url'],
    ['MCP_AUTH_JWKS_URL', ''],
  ])('rejects %s=%s', (key, value) => {
    const loaded = loadMcpConfig({ ...ENV, [key]: value })
    expect(loaded.ok).toBe(false)
    if (!loaded.ok) expect(loaded.problems).toContain(key)
  })

  it('allows loopback http only outside production', () => {
    const local = { ...ENV, MCP_BACKEND_ORIGIN: 'http://localhost:8000' }
    expect(loadMcpConfig(local).ok).toBe(true)
    expect(loadMcpConfig({ ...local, NODE_ENV: 'production' }).ok).toBe(false)
  })
})

describe('signDelegation', () => {
  const body = new TextEncoder().encode('{"limit":20}')

  it('binds endpoint, body, user, client and scope with ≤60 s of life', async () => {
    const now = nowS()
    const signed = await signDelegation({ config: config(), auth: auth(), path: BACKEND_PATHS.tripsList, body, nowS: now })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const claims = decodeJwt(signed.token)
    expect(claims).toMatchObject({
      iss: 'astrail-mcp-gateway', aud: `${BACKEND}/internal/mcp/v1/trips/list`, sub: USER_ID,
      client_id: CLIENT_ID, scope: 'mcp:read', bh: bodyHash(body),
    })
    expect(claims.exp! - claims.iat!).toBe(60)
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('never outlives the MCP token (outer expiry 20 s away)', async () => {
    const now = nowS()
    const signed = await signDelegation({ config: config(), auth: auth({ expiresAt: now + 20 }), path: BACKEND_PATHS.tripsList, body, nowS: now })
    expect(signed.ok && decodeJwt(signed.token).exp).toBe(now + 20)
  })

  it('refuses when the MCP token has under 5 s left', async () => {
    const now = nowS()
    const signed = await signDelegation({ config: config(), auth: auth({ expiresAt: now + 4 }), path: BACKEND_PATHS.tripsList, body, nowS: now })
    expect(signed).toEqual({ ok: false, reason: 'outer_token_expiring' })
  })

  it('mints a unique jti per call', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const signed = await signDelegation({ config: config(), auth: auth(), path: BACKEND_PATHS.tripsList, body })
      if (signed.ok) ids.add(String(decodeJwt(signed.token).jti))
    }
    expect(ids.size).toBe(5)
  })
})

describe('callBackend bounds', () => {
  const deps = (fetchImpl: typeof fetch) => ({ config: config(), auth: auth(), fetchImpl })
  const ok = (body: BodyInit, contentType = 'application/json') =>
    new Response(body, { status: 200, headers: { 'content-type': contentType } })

  it('uses a fixed URL, redirect: error, a timeout signal and never the MCP token', async () => {
    const fetchImpl = vi.fn(async () => ok(JSON.stringify({ trips: [], next_cursor: null })))
    await callBackend(deps(fetchImpl), BACKEND_PATHS.tripsList, { limit: 20 }, tripsPageSchema)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BACKEND}/internal/mcp/v1/trips/list`)
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(decodeJwt(new Headers(init.headers).get('authorization')!.slice(7)).iss).toBe('astrail-mcp-gateway')
  })

  it.each([
    ['a redirect (fetch rejects under redirect:error)', async () => { throw new TypeError('unexpected redirect') }],
    ['a timeout', async () => { throw new DOMException('timed out', 'TimeoutError') }],
    ['an oversize streamed body', async () => ok(new ReadableStream({
      start(c) { for (let i = 0; i < 9; i++) c.enqueue(new Uint8Array(64 * 1024).fill(32)); c.close() },
    }))],
    ['a look-alike content type', async () => ok(JSON.stringify({ trips: [], next_cursor: null }), 'application/jsonx')],
    ['a body that fails zod', async () => ok(JSON.stringify({ trips: 'nope' }))],
  ] as [string, () => Promise<Response>][])('%s → upstream_unavailable', async (_label, impl) => {
    await expect(callBackend(deps(impl as typeof fetch), BACKEND_PATHS.tripsList, { limit: 20 }, tripsPageSchema))
      .rejects.toMatchObject({ code: 'upstream_unavailable' })
  })

  it('the stream cap is 512 KiB', () => {
    expect(UPSTREAM_MAX_BYTES).toBe(512 * 1024)
  })
})

describe('protected-resource metadata', () => {
  it('serves RFC 9728 fields matching the verifier config', async () => {
    const res = protectedResourceMetadata(ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      resource: 'https://astrail.test/mcp',
      authorization_servers: ['https://project.supabase.test/auth/v1'],
      scopes_supported: ['openid'],
      bearer_methods_supported: ['header'],
    })
  })

  it('fails closed when unconfigured', () => {
    expect(protectedResourceMetadata({}).status).toBe(503)
  })
})

describe('privacy: no tokens or private results in logs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a full request cycle, success and failure, logs none of the sentinels', async () => {
    const lines: string[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')) })
    }
    const token = await mintToken({ email: 'sentinel-email@example.com' })
    const { keys } = await testKeys()
    const ok = fakeBackend()
    const failing = fakeBackend({ respond: () => new Response('{"error":{"code":"x","message":"SENTINEL_UPSTREAM"}}', { status: 500, headers: { 'content-type': 'application/json' } }) })
    for (const [backend, name] of [[ok, 'get_itinerary'], [failing, 'list_trips'], [ok, 'get_profile']] as const) {
      await handleMcpPost(rpcRequest('tools/call', { name, arguments: name === 'get_itinerary' ? { trip_id: '00000000-0000-4000-8000-000000000002' } : {} }, { token }),
        { env: ENV, keys, fetchImpl: backend.fetchImpl })
    }
    const all = lines.join('\n')
    expect(lines.length).toBeGreaterThan(0)
    for (const sentinel of [token, 'sentinel-email@example.com', 'SENTINEL_UPSTREAM', 'Senso', USER_ID, 'eyJ']) {
      expect(all).not.toContain(sentinel)
    }
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('module boundaries', () => {
  it('lib/mcp imports no Supabase client and reads no service-role credential', () => {
    const files = walk(join(FRONTEND, 'lib', 'mcp')).filter((f) => /\.ts$/.test(f) && !f.includes('__tests__') && !f.includes('generated'))
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, relative(FRONTEND, file)).not.toMatch(/@supabase\/|SERVICE_ROLE|service_role/)
    }
  })

  it('WebMCP files are byte-identical to the feat/webmcp baseline', () => {
    const baseline = readFileSync(join(__dirname, 'webmcp-baseline.sha256'), 'utf8').trim().split('\n')
    const expected = new Map(baseline.map((line) => {
      const [hash, path] = line.split(/\s+/)
      return [path, hash] as const
    }))
    const actual = [join(FRONTEND, 'lib', 'webmcp'), join(FRONTEND, 'components', 'webmcp')]
      .flatMap(walk).map((f) => relative(FRONTEND, f)).sort()
    expect(actual).toEqual([...expected.keys()].sort())
    for (const path of actual) {
      const hash = createHash('sha256').update(readFileSync(join(FRONTEND, path))).digest('hex')
      expect(hash, path).toBe(expected.get(path))
    }
  })
})
