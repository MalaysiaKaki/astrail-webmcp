// @vitest-environment node
/**
 * Signed static route maps: the signature, its derived key, the payload rules, and the proxy route
 * against a fake Mapbox. The token must never reach a response, a log line or a minted URL.
 */
import { createHmac, hkdfSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMcpConfig } from '../config'
import {
  STATIC_MAP_CONTEXT, STATIC_MAP_UPSTREAM_BURST, createUpstreamLimiter, encodePolyline, mapboxStaticImageUrl,
  signStaticMap, staticMapUrl, verifyStaticMap, type MapPin,
} from '../static-map'
import { handleStaticMap } from '../static-map-route'
import { ENV, SECRET } from './helpers'

const TOKEN = 'pk.test-static-map-token-0123456789abcdef'
const NOW = 1_800_000_000
const PINS: MapPin[] = [[139.7967, 35.7148, 1], [139.7954, 35.7118, 2], [139.7876, 35.7137, 3]]

/** A signature made exactly as the server makes it — to sign payloads the server itself never would. */
function forge(payload: unknown, key: Uint8Array = Buffer.from(hkdfSync('sha256', SECRET, new Uint8Array(0), STATIC_MAP_CONTEXT, 32))) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { p, s: createHmac('sha256', key).update(p).digest('base64url') }
}

describe('signStaticMap / verifyStaticMap', () => {
  it('round-trips, rounding coordinates to 5 decimals', () => {
    const { p, s } = signStaticMap(SECRET, [[139.796712345, 35.714812345, 1]], NOW)
    const v = verifyStaticMap(SECRET, p, s, NOW)
    expect(v).toEqual({ ok: true, payload: { v: 1, pins: [[139.79671, 35.71481, 1]], exp: NOW + 30 * 24 * 3600 } })
  })

  it('rejects a tampered payload or signature (403)', () => {
    const { p, s } = signStaticMap(SECRET, PINS, NOW)
    const flip = (x: string) => (x[5] === 'A' ? `${x.slice(0, 5)}B${x.slice(6)}` : `${x.slice(0, 5)}A${x.slice(6)}`)
    expect(verifyStaticMap(SECRET, flip(p), s, NOW)).toMatchObject({ ok: false, status: 403 })
    expect(verifyStaticMap(SECRET, p, flip(s), NOW)).toMatchObject({ ok: false, status: 403 })
    expect(verifyStaticMap(SECRET, p, null, NOW)).toMatchObject({ ok: false, status: 403 })
    expect(verifyStaticMap(SECRET, null, s, NOW)).toMatchObject({ ok: false, status: 403 })
  })

  it('uses a DERIVED key: a signature made with the raw delegation secret is rejected', () => {
    const raw = forge({ v: 1, pins: PINS, exp: NOW + 60 }, SECRET)
    expect(verifyStaticMap(SECRET, raw.p, raw.s, NOW)).toMatchObject({ ok: false, status: 403 })
    const derived = forge({ v: 1, pins: PINS, exp: NOW + 60 })
    expect(verifyStaticMap(SECRET, derived.p, derived.s, NOW).ok).toBe(true)
  })

  it('rejects an expired signature (403)', () => {
    const { p, s } = forge({ v: 1, pins: PINS, exp: NOW })
    expect(verifyStaticMap(SECRET, p, s, NOW)).toEqual({ ok: false, status: 403, error: 'expired' })
  })

  it('rejects a validly signed payload with too many pins, bad coordinates or extra fields (400)', () => {
    const many = Array.from({ length: 26 }, (_, i): MapPin => [139 + i / 100, 35, i + 1])
    for (const payload of [
      { v: 1, pins: many, exp: NOW + 60 },
      { v: 1, pins: [], exp: NOW + 60 },
      { v: 1, pins: [[181, 35, 1]], exp: NOW + 60 },
      { v: 1, pins: [[139, -91, 1]], exp: NOW + 60 },
      { v: 1, pins: [[139, 35, 0]], exp: NOW + 60 },
      { v: 2, pins: PINS, exp: NOW + 60 },
      { v: 1, pins: PINS, exp: NOW + 60, url: 'https://evil.example' },
    ]) {
      const { p, s } = forge(payload)
      expect(verifyStaticMap(SECRET, p, s, NOW), JSON.stringify(payload).slice(0, 60)).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('rejects a payload over 2 KB before any other work (403)', () => {
    const { p, s } = forge({ v: 1, pins: PINS, exp: NOW + 60, pad: 'x'.repeat(2100) })
    expect(verifyStaticMap(SECRET, p, s, NOW)).toMatchObject({ ok: false, status: 403 })
  })

  it('never mints more than 25 pins', () => {
    const many = Array.from({ length: 40 }, (_, i): MapPin => [139 + i / 100, 35, i + 1])
    const url = new URL(staticMapUrl('https://astrail.test', SECRET, many, NOW))
    const v = verifyStaticMap(SECRET, url.searchParams.get('p'), url.searchParams.get('s'), NOW)
    expect(v.ok && v.payload.pins.length).toBe(25)
  })
})

describe('the Mapbox request', () => {
  it('encodes the route as a Google polyline (reference vector)', () => {
    expect(encodePolyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  })

  it('draws the line in stop order and a numbered brass pin per stop, auto-framed at 640x320@2x', () => {
    const url = mapboxStaticImageUrl({ v: 1, pins: PINS, exp: NOW + 60 }, TOKEN)
    expect(url).toMatch(/^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/static\//)
    expect(url).toContain(`path-4+A8702C-0.85(${encodeURIComponent(encodePolyline(PINS.map(([a, b]) => [a, b])))})`)
    expect(url).toContain('pin-l-1+A8702C(139.7967,35.7148),pin-l-2+A8702C(139.7954,35.7118),pin-l-3+A8702C(139.7876,35.7137)')
    expect(url).toContain('/auto/640x320@2x?')
    expect(new URL(url).searchParams.get('access_token')).toBe(TOKEN)
  })

  it('a single stop gets a pin and no line; a trail number past 99 gets an unlabelled pin', () => {
    const one = mapboxStaticImageUrl({ v: 1, pins: [[139.7, 35.7, 120]], exp: NOW + 60 }, TOKEN)
    expect(one).not.toContain('path-')
    expect(one).toContain('/pin-l+A8702C(139.7,35.7)/auto/')
  })
})

describe('GET /api/mcp/static-map', () => {
  const env = { ...ENV, MCP_MAPBOX_STATIC_TOKEN: TOKEN }
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  const request = (p: string, s: string) => new Request(`https://astrail.test/api/mcp/static-map?p=${p}&s=${s}`)
  const signed = () => signStaticMap(SECRET, PINS, NOW)
  const mapbox = (body: BodyInit | null = PNG, init: ResponseInit = { headers: { 'Content-Type': 'image/png' } }) =>
    vi.fn(async () => new Response(body, init))
  const logs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    logs.length = 0
  })
  const captureLogs = () => {
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    }
  }

  it('proxies a verified map: the image, cached a day, CORS-open, from ONE hardened Mapbox fetch', async () => {
    captureLogs()
    const fetchImpl = mapbox()
    const { p, s } = signed()
    const res = await handleStaticMap(request(p, s), { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(res.headers.get('vercel-cdn-cache-control')).toBe('public, max-age=86400')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('api.mapbox.com/styles/v1/mapbox/streets-v12/static/')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    // The token went to Mapbox and nowhere else.
    expect([...res.headers.values()].join()).not.toContain(TOKEN)
    expect(logs.join('\n')).not.toContain(TOKEN)
    expect(logs.join('\n')).not.toContain('api.mapbox.com')
  })

  it('no token → 404 map_unavailable, with no Mapbox call', async () => {
    const fetchImpl = mapbox()
    const { p, s } = signed()
    const res = await handleStaticMap(request(p, s), { env: ENV, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'map_unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('tampered → 403, expired → 403, too many pins → 400; none reach Mapbox', async () => {
    const fetchImpl = mapbox()
    const { p, s } = signed()
    expect((await handleStaticMap(request(p, `${s.slice(0, -1)}${s.endsWith('A') ? 'B' : 'A'}`), { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })).status).toBe(403)
    expect((await handleStaticMap(request(p, s), { env, fetchImpl, nowS: () => NOW + 31 * 24 * 3600, limiter: createUpstreamLimiter() })).status).toBe(403)
    const many = forge({ v: 1, pins: Array.from({ length: 26 }, (_, i) => [139, 35, i + 1]), exp: NOW + 60 })
    expect((await handleStaticMap(request(many.p, many.s), { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a Mapbox failure, a non-raster type (SVG), an oversized image or a network error → 502', async () => {
    captureLogs()
    const { p, s } = signed()
    const cases = [
      mapbox('nope', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      mapbox('<svg onload="alert(1)"/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
      mapbox(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }),
      vi.fn(async () => { throw new TypeError(`fetch failed for https://api.mapbox.com/...access_token=${TOKEN}`) }),
    ]
    for (const fetchImpl of cases) {
      const res = await handleStaticMap(request(p, s), { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'map_upstream' })
    }
    expect(logs.join('\n')).not.toContain(TOKEN)
  })

  it('accepts ONLY the canonical ?p=&s= query: extras, duplicates, reordering, encoding → 400, no Mapbox call', async () => {
    const fetchImpl = mapbox()
    const { p, s } = signed()
    const base = 'https://astrail.test/api/mcp/static-map'
    for (const query of [
      `?p=${p}&s=${s}&cache_buster=1`,
      `?p=${p}&s=${s}&s=${s}`,
      `?p=${p}&p=${p}&s=${s}`,
      `?s=${s}&p=${p}`,
      `?p=${p}&s=${s}&`,
      `?p=${p.slice(0, 4)}%${p.charCodeAt(4).toString(16)}${p.slice(5)}&s=${s}`,
      `?p=${p}`,
      '',
    ]) {
      const res = await handleStaticMap(new Request(`${base}${query}`), { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
      expect(res.status, query.slice(0, 40)).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects Authorization and Range (they bypass the CDN cache) → 400, no Mapbox call', async () => {
    const fetchImpl = mapbox()
    const { p, s } = signed()
    for (const [name, value] of [['Authorization', 'Bearer x'], ['Range', 'bytes=0-10']]) {
      const req = new Request(`https://astrail.test/api/mcp/static-map?p=${p}&s=${s}`, { headers: { [name]: value } })
      const res = await handleStaticMap(req, { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
      expect(res.status, name).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('serves a request that carries cookies (a same-site <img> does; Cookie does not bypass the cache)', async () => {
    const fetchImpl = mapbox()
    const { p, s } = signed()
    const req = new Request(`https://astrail.test/api/mcp/static-map?p=${p}&s=${s}`, { headers: { Cookie: 'sb-access=x' } })
    const res = await handleStaticMap(req, { env, fetchImpl, nowS: () => NOW, limiter: createUpstreamLimiter() })
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent identical requests into ONE upstream fetch', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const fetchImpl = vi.fn(async () => {
      await gate
      return new Response(PNG, { headers: { 'Content-Type': 'image/png' } })
    })
    const limiter = createUpstreamLimiter()
    const { p, s } = signed()
    const pending = [1, 2, 3].map(() => handleStaticMap(request(p, s), { env, fetchImpl, nowS: () => NOW, limiter }))
    await new Promise((r) => setTimeout(r, 10))
    release()
    const responses = await Promise.all(pending)
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200])
    for (const r of responses) expect(new Uint8Array(await r.arrayBuffer())).toEqual(PNG)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('stops starting NEW upstream fetches past the per-instance ceiling (429), and refills over time', async () => {
    const fetchImpl = mapbox()
    let clock = 0
    const limiter = createUpstreamLimiter(() => clock)
    const call = (i: number) => {
      const { p, s } = signStaticMap(SECRET, [[139 + i / 1000, 35.7, 1]], NOW)
      return handleStaticMap(request(p, s), { env, fetchImpl, nowS: () => NOW, limiter })
    }
    for (let i = 0; i < STATIC_MAP_UPSTREAM_BURST; i++) expect((await call(i)).status).toBe(200)
    const over = await call(999)
    expect(over.status).toBe(429)
    expect(over.headers.get('cache-control')).toBe('no-store')
    expect(fetchImpl).toHaveBeenCalledTimes(STATIC_MAP_UPSTREAM_BURST)
    clock += 60_000                                       // a minute later the bucket has refilled
    expect((await call(1000)).status).toBe(200)
  })

  it('never lets a cache keep a map past its signed expiry', async () => {
    const { p, s } = signStaticMap(SECRET, PINS, NOW)
    const exp = NOW + 30 * 24 * 3600
    const at = (...times: number[]) => {
      const clock = [...times]
      return () => (clock.length > 1 ? clock.shift()! : clock[0])
    }
    // One second before expiry: one second of freshness, for the browser and the CDN.
    const late = await handleStaticMap(request(p, s), { env, fetchImpl: mapbox(), nowS: at(exp - 1), limiter: createUpstreamLimiter() })
    expect(late.status).toBe(200)
    expect(late.headers.get('cache-control')).toBe('public, max-age=1')
    expect(late.headers.get('vercel-cdn-cache-control')).toBe('public, max-age=1')
    // Valid when verified, expired by the time the upstream image arrived: served, never stored.
    const crossed = await handleStaticMap(request(p, s), { env, fetchImpl: mapbox(), nowS: at(exp - 1, exp + 1), limiter: createUpstreamLimiter() })
    expect(crossed.status).toBe(200)
    expect(crossed.headers.get('cache-control')).toBe('no-store')
    expect(crossed.headers.get('vercel-cdn-cache-control')).toBeNull()
    // At expiry itself: rejected outright.
    expect((await handleStaticMap(request(p, s), { env, fetchImpl: mapbox(), nowS: at(exp), limiter: createUpstreamLimiter() })).status).toBe(403)
  })

  it('a malformed token fails the MCP config closed; unset is fine', () => {
    expect(loadMcpConfig({ ...ENV, MCP_MAPBOX_STATIC_TOKEN: 'has spaces in it and is not a token' }).ok).toBe(false)
    const unset = loadMcpConfig(ENV)
    expect(unset.ok && unset.config.mapboxStaticToken).toBe(null)
    const empty = loadMcpConfig({ ...ENV, MCP_MAPBOX_STATIC_TOKEN: '' })
    expect(empty.ok && empty.config.mapboxStaticToken).toBe(null)
  })
})
