/**
 * Test harness for the MCP gateway: a local ES256 key set, a token minter, a fake FastAPI that
 * verifies the delegation token for real, and JSON-RPC request builders for the actual handler.
 */
import { createHash } from 'node:crypto'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, type JWK, type JWTPayload } from 'jose'
import { MULTI_SOURCE_RESPONSE } from '@/mcp-app/src/__fixtures__/multi-source-bundle'
import type { ItineraryResponse, SavedReelsPage, TripsPage } from '../contract'

export const USER_ID = '11111111-1111-4111-8111-111111111111'
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
export const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
export const RESOURCE = 'https://astrail.test/mcp'
export const ISSUER = 'https://project.supabase.test/auth/v1'
export const BACKEND = 'https://api.astrail.test'
export const SECRET_B64 = Buffer.alloc(64, 7).toString('base64')
export const SECRET = new Uint8Array(Buffer.from(SECRET_B64, 'base64'))

export const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  MCP_RESOURCE_URL: RESOURCE,
  MCP_AUTH_ISSUER: ISSUER,
  MCP_AUTH_JWKS_URL: `${ISSUER}/.well-known/jwks.json`,
  MCP_ALLOWED_CLIENT_IDS: CLIENT_ID,
  MCP_BACKEND_ORIGIN: BACKEND,
  MCP_DELEGATION_SECRET: SECRET_B64,
  MCP_ALLOWED_ORIGINS: 'https://inspector.astrail.test',
}

type Keys = { privateKey: CryptoKey; keys: ReturnType<typeof createLocalJWKSet>; jwk: JWK }
let cached: Promise<Keys> | null = null

export function testKeys(): Promise<Keys> {
  cached ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' }
    return { privateKey, jwk, keys: createLocalJWKSet({ keys: [jwk] }) }
  })()
  return cached
}

export const nowS = () => Math.floor(Date.now() / 1000)

export function validClaims(overrides: Record<string, unknown> = {}): JWTPayload {
  return {
    iss: ISSUER,
    aud: RESOURCE,
    sub: USER_ID,
    client_id: CLIENT_ID,
    role: 'astrail_mcp_resource',
    astrail_mcp_access: true,
    scope: 'openid',
    email: 'traveller@example.com',
    user_metadata: { full_name: 'Test Traveller' },
    iat: nowS() - 10,
    exp: nowS() + 3600,
    ...overrides,
  }
}

/** Sign claims with the test ES256 key. `drop` removes claims entirely. */
export async function mintToken(overrides: Record<string, unknown> = {}, drop: string[] = []): Promise<string> {
  const { privateKey } = await testKeys()
  const claims = validClaims(overrides)
  for (const key of drop) delete claims[key]
  return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' }).sign(privateKey)
}

let rpcId = 0
export function rpcRequest(method: string, params: Record<string, unknown> = {}, init: {
  token?: string | null; headers?: Record<string, string>; url?: string; body?: string
} = {}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    ...init.headers,
  }
  return new Request(init.url ?? RESOURCE, {
    method: 'POST',
    headers,
    body: init.body ?? JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
}

export const INITIALIZE_PARAMS = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'vitest', version: '1.0.0' },
}

export type BackendCall = { path: string; body: unknown; token: string; claims: JWTPayload; headers: Headers }

export const TRIPS_PAGE: TripsPage = {
  trips: [{
    trip_id: MULTI_SOURCE_RESPONSE.bundle.trip.id,
    title: 'Tokyo in three days',
    destination: 'Tokyo',
    status: 'complete',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    day_count: 3,
    created_at: '2026-09-01T00:00:00Z',
  }],
  next_cursor: null,
}

export const REELS_PAGE: SavedReelsPage = {
  reels: [{
    reel_id: '44444444-4444-4444-8444-444444444444',
    platform: 'instagram',
    kind: 'reel',
    shortcode: 'DAsakusa01',
    status: 'organized',
    saved_at: '2026-09-02T00:00:00Z',
    place_count: 2,
    places: [{ name: 'Senso-ji', country_name: 'Japan' }, { name: 'Nakamise', country_name: 'Japan' }],
  }],
  next_cursor: null,
}

/**
 * A fake FastAPI. It verifies each delegation token the way backend/auth_delegation.py must
 * (HS256, issuer, exact endpoint audience, body hash) and records every call for assertions.
 */
export function fakeBackend(responses: {
  itinerary?: ItineraryResponse | ((body: Record<string, unknown>) => Response)
  trips?: TripsPage
  reels?: SavedReelsPage
  respond?: (path: string) => Response | undefined
} = {}) {
  const calls: BackendCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const token = (headers.get('authorization') ?? '').replace(/^Bearer /, '')
    const raw = init?.body as Uint8Array
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: ['HS256'], issuer: 'astrail-mcp-gateway', audience: `${BACKEND}${url.pathname}`,
    })
    const hash = createHash('sha256').update(raw).digest('base64url')
    if (payload.bh !== hash) throw new Error('body hash mismatch')
    const body = JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string, unknown>
    calls.push({ path: url.pathname, body, token, claims: payload, headers })

    const custom = responses.respond?.(url.pathname)
    if (custom) return custom
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/trips/list')) return json(responses.trips ?? TRIPS_PAGE)
    if (url.pathname.endsWith('/saved-reels/list')) return json(responses.reels ?? REELS_PAGE)
    if (url.pathname.endsWith('/trips/itinerary')) {
      const it = responses.itinerary ?? MULTI_SOURCE_RESPONSE
      return typeof it === 'function' ? it(body) : json(it)
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  }
  return { calls, fetchImpl }
}

export async function rpcJson(res: Response): Promise<{ result?: Record<string, unknown>; error?: { code: number; message: string } }> {
  return (await res.json()) as { result?: Record<string, unknown>; error?: { code: number; message: string } }
}
