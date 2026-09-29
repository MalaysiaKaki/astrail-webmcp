/**
 * Signed per-day route maps for the ChatGPT widget (no Mapbox GL inside the widget).
 *
 * render_itinerary mints a URL on OUR origin — /api/mcp/static-map?p=<payload>&s=<sig> — for each
 * day with located stops. The route (app/api/mcp/static-map) verifies it and proxies one Mapbox
 * Static Images request, so:
 *   - the Mapbox token never leaves the server (it is not in the widget, the URL or a log line);
 *   - the widget's CSP needs no Mapbox domain (the image comes from resourceOrigin);
 *   - nobody can turn the route into an open Mapbox proxy: only coordinates we signed render.
 *
 * The signing key is DERIVED from MCP_DELEGATION_SECRET (HKDF, context `astrail-static-map-v1`),
 * never the delegation key itself, so a map signature can never be confused with, or used to
 * forge, a delegation token.
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { MCP_LIMITS } from './contract'

export const STATIC_MAP_PATH = '/api/mcp/static-map'
export const STATIC_MAP_CONTEXT = 'astrail-static-map-v1'
export const STATIC_MAP_TTL_S = 30 * 24 * 60 * 60
export const STATIC_MAP_MAX_PINS = MCP_LIMITS.mapPins
export const STATIC_MAP_MAX_PAYLOAD_CHARS = 2048
/** The app's active-route brass (components/map/day-emphasis.ts ACTIVE_ROUTE_COLOR). */
export const ROUTE_HEX = 'A8702C'
/** streets-v12: the Static Images style closest to the app's warm Standard/dawn basemap. */
const MAPBOX_STYLE = 'mapbox/streets-v12'

/** Longest a verified map may be cached, by the browser or the CDN (always also ≤ the signed expiry). */
export const STATIC_MAP_MAX_CACHE_S = 86400
/**
 * Per-INSTANCE ceiling on NEW Mapbox fetches: a token bucket of STATIC_MAP_UPSTREAM_BURST, refilled
 * at STATIC_MAP_UPSTREAM_PER_MINUTE. It bounds what one warm function instance can spend when a
 * signed URL is replayed faster than the CDN caches it; it is NOT a global quota (Vercel runs many
 * instances). The main spending control is the CDN cache (static-map-route.ts), keyed on the one
 * canonical URL each signed map has.
 */
export const STATIC_MAP_UPSTREAM_BURST = 20
export const STATIC_MAP_UPSTREAM_PER_MINUTE = 30

/** [lng, lat, label]: the label is the stop's trip-wide trail number, the one its card shows. */
export type MapPin = [number, number, number]

const pinSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
  z.number().int().min(1).max(999),
])
const payloadSchema = z.object({
  v: z.literal(1),
  pins: z.array(pinSchema).min(1).max(STATIC_MAP_MAX_PINS),
  exp: z.number().int().positive(),
}).strict()
export type StaticMapPayload = z.infer<typeof payloadSchema>

const B64URL = /^[A-Za-z0-9_-]+$/
const SIG_CHARS = 43   // base64url of a 32-byte HMAC-SHA256, unpadded

function deriveKey(secret: Uint8Array): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, new Uint8Array(0), STATIC_MAP_CONTEXT, 32))
}

function sign(secret: Uint8Array, payload: string): string {
  return createHmac('sha256', deriveKey(secret)).update(payload).digest('base64url')
}

/** Coordinates to 5 decimals (~1 m): enough for a pin, and a short, stable payload. */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

export function signStaticMap(secret: Uint8Array, pins: MapPin[], nowS: number): { p: string; s: string } {
  const payload: StaticMapPayload = {
    v: 1,
    pins: pins.slice(0, STATIC_MAP_MAX_PINS).map(([lng, lat, n]) => [round5(lng), round5(lat), n]),
    exp: nowS + STATIC_MAP_TTL_S,
  }
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { p, s: sign(secret, p) }
}

export function staticMapUrl(origin: string, secret: Uint8Array, pins: MapPin[], nowS: number): string {
  const { p, s } = signStaticMap(secret, pins, nowS)
  return `${origin}${STATIC_MAP_PATH}?p=${p}&s=${s}`
}

export type VerifyResult =
  | { ok: true; payload: StaticMapPayload }
  | { ok: false; status: 400 | 403; error: 'bad_request' | 'bad_signature' | 'expired' }

/** Signature FIRST (constant time), then shape, then expiry. Nothing unsigned is ever parsed. */
export function verifyStaticMap(secret: Uint8Array, p: string | null, s: string | null, nowS: number): VerifyResult {
  if (!p || !s || p.length > STATIC_MAP_MAX_PAYLOAD_CHARS || !B64URL.test(p) || s.length !== SIG_CHARS || !B64URL.test(s)) {
    return { ok: false, status: 403, error: 'bad_signature' }
  }
  const expected = Buffer.from(sign(secret, p))
  const given = Buffer.from(s)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, status: 403, error: 'bad_signature' }
  }
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, status: 400, error: 'bad_request' }
  }
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) return { ok: false, status: 400, error: 'bad_request' }
  if (parsed.data.exp <= nowS) return { ok: false, status: 403, error: 'expired' }
  return { ok: true, payload: parsed.data }
}

/** Google encoded polyline, precision 5, over [lat, lng] — the format Mapbox `path-` overlays read. */
export function encodePolyline(points: [number, number][]): string {
  let out = ''
  let prevLat = 0
  let prevLng = 0
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    out += String.fromCharCode(v + 63)
  }
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e5)
    const ln = Math.round(lng * 1e5)
    encode(la - prevLat)
    encode(ln - prevLng)
    prevLat = la
    prevLng = ln
  }
  return out
}

/**
 * The Mapbox Static Images request for a verified payload: the route line through the pins in stop
 * order (when there are at least two), then a large brass pin per stop labelled with its trail
 * number (Mapbox labels go to 99; a higher number draws an unlabelled pin rather than a wrong one).
 */
export function mapboxStaticImageUrl(payload: StaticMapPayload, token: string): string {
  const overlays: string[] = []
  if (payload.pins.length >= 2) {
    const line = encodePolyline(payload.pins.map(([lng, lat]) => [lng, lat]))
    overlays.push(`path-4+${ROUTE_HEX}-0.85(${encodeURIComponent(line)})`)
  }
  for (const [lng, lat, n] of payload.pins) {
    overlays.push(`pin-l${n <= 99 ? `-${n}` : ''}+${ROUTE_HEX}(${lng},${lat})`)
  }
  const params = new URLSearchParams({ padding: '56', access_token: token })
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${overlays.join(',')}/auto/640x320@2x?${params}`
}

/**
 * The token bucket above plus in-flight coalescing: the same verified payload requested while its
 * upstream fetch is running joins that fetch instead of starting another. Joiners never spend a
 * token. Nothing is kept once a fetch settles — caching the image is the CDN's job.
 */
export function createUpstreamLimiter(now: () => number = () => Date.now()) {
  const inFlight = new Map<string, Promise<unknown>>()
  let tokens = STATIC_MAP_UPSTREAM_BURST
  let refilledAt = now()
  const refill = () => {
    const t = now()
    tokens = Math.min(STATIC_MAP_UPSTREAM_BURST, tokens + ((t - refilledAt) / 60_000) * STATIC_MAP_UPSTREAM_PER_MINUTE)
    refilledAt = t
  }
  return {
    /** Join the in-flight fetch for `key`, or start `fetchOnce` if a token is left; null = over the ceiling. */
    run<T>(key: string, fetchOnce: () => Promise<T>): Promise<T> | null {
      const joined = inFlight.get(key)
      if (joined) return joined as Promise<T>
      refill()
      if (tokens < 1) return null
      tokens -= 1
      const started = fetchOnce().finally(() => inFlight.delete(key))
      inFlight.set(key, started)
      return started
    },
  }
}
export type UpstreamLimiter = ReturnType<typeof createUpstreamLimiter>
