/**
 * Bounded calls to the FastAPI MCP read endpoints (docs/mcp-app/PLAN.md §2.3, requirement 5).
 *
 * Upstream URLs are `config.backendOrigin` + a constant path — tool arguments only ever appear in
 * the JSON body, never in a URL (requirement 4). Every call: redirect → error, 8 s timeout,
 * streamed 512 KiB cap, exact application/json, zod validation. Failures become ToolErrors.
 */
import type { z } from 'zod'
import type { McpAuth } from './auth'
import type { McpConfig } from './config'
import { signDelegation } from './delegation'
import { ToolError, rateLimitedText, toolError } from './errors'

export const BACKEND_PATHS = {
  tripsList: '/internal/mcp/v1/trips/list',
  itinerary: '/internal/mcp/v1/trips/itinerary',
  savedReelsList: '/internal/mcp/v1/saved-reels/list',
} as const
export type BackendPath = (typeof BACKEND_PATHS)[keyof typeof BACKEND_PATHS]

export const UPSTREAM_TIMEOUT_MS = 8000
export const UPSTREAM_MAX_BYTES = 512 * 1024

export type BackendDeps = { config: McpConfig; auth: McpAuth; fetchImpl?: typeof fetch }

async function readCapped(res: Response, limit: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function isJson(res: Response): boolean {
  const value = res.headers.get('content-type')
  return value !== null && value.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

/** The backend's envelope code ({"error":{"code"}}), when it sent one. Never its message. */
function envelopeCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function statusError(status: number, code: string | null, retryAfter: string | null): ToolError {
  if (status === 401) return toolError('service_unverified')
  if (status === 403) return toolError('forbidden')
  if (status === 404) return toolError('not_found')
  if (status === 409) return toolError('conflict')
  if (status === 413 || code === 'too_large') return toolError('too_large')
  if (status === 429) {
    const seconds = Number(retryAfter)
    const retry = Number.isInteger(seconds) && seconds > 0 && seconds < 3600 ? seconds : undefined
    return new ToolError('rate_limited', rateLimitedText(retry), retry)
  }
  if (status === 503) return toolError('service_unavailable')
  return toolError('upstream_unavailable')
}

function parseJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return { ok: false }
  }
}

/** POST `body` to a fixed backend path under a fresh delegation token; validate with `schema`. */
export async function callBackend<S extends z.ZodTypeAny>(
  deps: BackendDeps,
  path: BackendPath,
  body: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  const delegation = await signDelegation({ config: deps.config, auth: deps.auth, path, body: bytes })
  if (!delegation.ok) throw toolError('reauth_required')

  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(`${deps.config.backendOrigin}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${delegation.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: bytes,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    throw toolError('upstream_unavailable')
  }

  const raw = await readCapped(res, UPSTREAM_MAX_BYTES).catch(() => null)
  if (raw === null) throw toolError('upstream_unavailable')
  const parsed = isJson(res) ? parseJson(raw) : { ok: false as const }

  if (!res.ok) throw statusError(res.status, parsed.ok ? envelopeCode(parsed.value) : null, res.headers.get('retry-after'))
  if (!parsed.ok) throw toolError('upstream_unavailable')

  const validated = schema.safeParse(parsed.value)
  if (!validated.success) throw toolError('upstream_unavailable')
  return validated.data
}
