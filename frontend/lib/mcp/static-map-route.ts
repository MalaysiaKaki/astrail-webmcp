/**
 * GET /api/mcp/static-map?p=&s= — the verified proxy behind the widget's per-day route maps
 * (lib/mcp/static-map.ts). Pure over its dependencies so the tests drive it with a fake Mapbox.
 *
 * Errors are fixed JSON codes, and the log line is allowlisted fields only: never the Mapbox
 * token, and never the upstream URL (it carries the token in its query).
 */
import { loadMcpConfig } from './config'
import {
  STATIC_MAP_MAX_CACHE_S, createUpstreamLimiter, mapboxStaticImageUrl, verifyStaticMap,
  type StaticMapPayload, type UpstreamLimiter,
} from './static-map'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8000
/** Raster only. Never image/svg+xml: an SVG served from OUR origin runs script when opened directly. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * The ONE query form a minted map URL has (staticMapUrl): `?p=<base64url>&s=<43-char base64url>`.
 * Anything else — an extra or repeated parameter, another order, percent-encoding — is rejected
 * before any work, so a signed URL cannot be varied into new CDN cache keys (cache-busting would
 * otherwise turn one URL into unlimited paid Mapbox requests).
 */
const CANONICAL_QUERY = /^\?p=([A-Za-z0-9_-]{1,2048})&s=([A-Za-z0-9_-]{43})$/

/**
 * Request headers that make Vercel's CDN skip its cache (vercel.com/docs/caching/cdn-cache "Cacheable
 * response criteria"), so each such request would reach this handler and cost a Mapbox call. The
 * widget's <img> sends neither. Cookie is deliberately NOT here: it does not disqualify caching, and
 * a same-site <img> (local Inspector on another localhost port, say) legitimately carries cookies.
 */
const CACHE_BYPASS_HEADERS = ['authorization', 'range'] as const

/** Per-instance (module scope lives as long as the warm function instance). See static-map.ts. */
const defaultLimiter = createUpstreamLimiter()

export type StaticMapDeps = {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  nowS?: () => number
  limiter?: UpstreamLimiter
}

type Upstream = { ok: true; type: string; image: Uint8Array<ArrayBuffer> } | { ok: false; reason: string }

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function log(status: number, reason: string, startedAt: number): void {
  console.info(JSON.stringify({ evt: 'static_map', status, reason, ms: Date.now() - startedAt }))
}

/** The body, or null if it is larger than the cap (the stream is cancelled at the cap). */
async function readCapped(res: Response): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** One hardened Mapbox fetch. Never throws; the reason is a fixed code, never error text. */
async function fetchUpstream(payload: StaticMapPayload, token: string, fetchImpl: typeof fetch): Promise<Upstream> {
  let upstream: Response
  try {
    upstream = await fetchImpl(mapboxStaticImageUrl(payload, token), {
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    // The error text can include the request URL, and with it the token: never logged.
    return { ok: false, reason: 'upstream_fetch' }
  }
  const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  if (!upstream.ok || !IMAGE_TYPES.has(type)) {
    await upstream.body?.cancel().catch(() => {})
    return { ok: false, reason: upstream.ok ? 'upstream_type' : `upstream_${upstream.status}` }
  }
  try {
    const image = await readCapped(upstream)
    return image ? { ok: true, type, image } : { ok: false, reason: 'upstream_size' }
  } catch {
    return { ok: false, reason: 'upstream_read' }
  }
}

/**
 * Cache lifetime at RESPONSE time: min(STATIC_MAP_MAX_CACHE_S, exp - now), for the browser AND the
 * CDN, so no cache keeps serving a map past its signed expiry. Measured after the upstream fetch,
 * so time spent fetching counts. At or past expiry: no-store.
 */
function cacheHeaders(exp: number, nowS: number): Record<string, string> {
  const ttl = Math.min(STATIC_MAP_MAX_CACHE_S, exp - nowS)
  if (ttl <= 0) return { 'Cache-Control': 'no-store' }
  return {
    'Cache-Control': `public, max-age=${ttl}`,
    // Vercel's CDN cache (stripped before the browser). A Function response is cached only with an
    // explicit shared-cache directive; `force-dynamic` concerns Next's own render/fetch caching and
    // does not touch the headers this handler returns. Keyed on the canonical URL (see above).
    'Vercel-CDN-Cache-Control': `public, max-age=${ttl}`,
  }
}

export async function handleStaticMap(req: Request, deps: StaticMapDeps = {}): Promise<Response> {
  const startedAt = Date.now()
  const now = deps.nowS ?? (() => Math.floor(Date.now() / 1000))
  const loaded = loadMcpConfig(deps.env ?? process.env)
  if (!loaded.ok) {
    log(503, 'config', startedAt)
    return json(503, 'server_misconfigured')
  }
  const token = loaded.config.mapboxStaticToken
  if (!token) {
    log(404, 'no_token', startedAt)
    return json(404, 'map_unavailable')
  }

  if (CACHE_BYPASS_HEADERS.some((h) => req.headers.has(h))) {
    log(400, 'cache_ineligible_header', startedAt)
    return json(400, 'bad_request')
  }
  const query = CANONICAL_QUERY.exec(new URL(req.url).search)
  if (!query) {
    log(400, 'non_canonical_query', startedAt)
    return json(400, 'bad_request')
  }
  const verified = verifyStaticMap(loaded.config.delegationSecret, query[1], query[2], now())
  if (!verified.ok) {
    log(verified.status, verified.error, startedAt)
    return json(verified.status, verified.error)
  }

  // The verified payload string is the coalescing key: same signed map → one shared fetch.
  const shared = (deps.limiter ?? defaultLimiter).run(query[1], () =>
    fetchUpstream(verified.payload, token, deps.fetchImpl ?? fetch))
  if (!shared) {
    log(429, 'upstream_ceiling', startedAt)
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '10' },
    })
  }
  const result = await shared
  if (!result.ok) {
    log(502, result.reason, startedAt)
    return json(502, 'map_upstream')
  }
  log(200, 'ok', startedAt)
  return new Response(result.image, {
    status: 200,
    headers: {
      'Content-Type': result.type,
      ...cacheHeaders(verified.payload.exp, now()),
      // The widget renders in a sandboxed frame with an opaque origin.
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
