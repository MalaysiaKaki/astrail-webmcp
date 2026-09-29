/**
 * MCP access-token verification (docs/mcp-app/PLAN.md §3 requirement 3).
 *
 * Every request's bearer is verified against the authorization server's JWKS: ES256/RS256 only,
 * exact issuer, a STRING audience equal to the canonical resource URL, the resource-only role and
 * signed permission set by the shared Supabase hook, an allowlisted client, and the required scopes.
 *
 * The hook is SHARED with the astrail-mcp server (astrail-app migration history,
 * `private.astrail_mcp_access_token`): every OAuth token gets role `astrail_mcp_resource` and
 * `astrail_mcp_access: true`, and only `aud` differs per client. So the audience check is the
 * one that separates this server from astrail-mcp — never relax it. The token itself never leaves
 * this module — downstream code only ever sees the resolved `McpAuth` (no passthrough).
 */
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose'
import { MCP_REQUIRED_SCOPES, type McpConfig } from './config'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IAT_SKEW_S = 60
/** Resource-only role the shared hook stamps on OAuth tokens (never a real Postgres role). */
export const MCP_RESOURCE_ROLE = 'astrail_mcp_resource'

export type McpAuth = {
  userId: string
  clientId: string
  /** Seconds since epoch; the delegation token may never outlive it. */
  expiresAt: number
  email?: string
  name?: string
}

export type AuthFailure = { status: 401 | 403 | 503; challenge: string | null; reason: string }
export type AuthResult = { ok: true; auth: McpAuth } | { ok: false; failure: AuthFailure }

type KeySet = ReturnType<typeof createRemoteJWKSet>
const keySets = new Map<string, KeySet>()

/** One cached JWKS per URL (immutable module cache; per-request state never lives here). */
function keySetFor(url: string): KeySet {
  let set = keySets.get(url)
  if (!set) {
    set = createRemoteJWKSet(new URL(url), { timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 600_000 })
    keySets.set(url, set)
  }
  return set
}

/** Test seam: verify with a local key set instead of fetching one. */
export type KeyResolver = Parameters<typeof jwtVerify>[1]

export function bearerChallenge(config: McpConfig, error?: { code: string; description: string }): string {
  const parts = [`resource_metadata="${config.metadataUrl}"`, `scope="${MCP_REQUIRED_SCOPES.join(' ')}"`]
  if (error) parts.push(`error="${error.code}"`, `error_description="${error.description}"`)
  return `Bearer ${parts.join(', ')}`
}

function unauthorized(config: McpConfig, reason: string, presented: boolean): AuthResult {
  const challenge = presented
    ? bearerChallenge(config, { code: 'invalid_token', description: 'The access token is invalid or expired.' })
    : bearerChallenge(config)
  return { ok: false, failure: { status: 401, challenge, reason } }
}

function readBearer(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(header.trim())
  return match ? match[1] : null
}

function stringClaim(payload: JWTPayload, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function displayName(payload: JWTPayload): string | undefined {
  const meta = payload.user_metadata
  if (!meta || typeof meta !== 'object') return undefined
  const record = meta as Record<string, unknown>
  for (const key of ['full_name', 'name']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120)
  }
  return undefined
}

function hasRequiredScopes(payload: JWTPayload): boolean {
  const scope = payload.scope
  if (typeof scope !== 'string') return false
  const granted = new Set(scope.split(' ').filter(Boolean))
  return MCP_REQUIRED_SCOPES.every((s) => granted.has(s))
}

/** Claim checks jose does not do for us; returns a reason string on failure. */
function checkClaims(payload: JWTPayload, config: McpConfig, nowS: number): string | null {
  if (typeof payload.aud !== 'string' || payload.aud !== config.resourceUrl) return 'audience'
  if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) return 'subject'
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return 'exp'
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > nowS + MAX_IAT_SKEW_S) return 'iat'
  const clientId = payload.client_id
  if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) return 'client_id'
  if (!config.allowedClientIds.has(clientId.toLowerCase())) return 'client_not_allowed'
  if (payload.role !== MCP_RESOURCE_ROLE) return 'role'
  if (payload.astrail_mcp_access !== true) return 'permission'
  return null
}

/**
 * A key-SERVICE failure (unreachable, timed out, non-200, unparseable, not a JWKS) is our outage:
 * 503. A key-SELECTION or token failure (no matching kid, bad signature, bad claims) is the token's
 * fault: 401. jose 6 reports non-200 and invalid-JSON JWKS responses with the BASE JOSEError
 * (code ERR_JOSE_GENERIC); every token/key-selection failure is a subclass with its own code.
 */
function isKeySetOutage(err: unknown): boolean {
  if (err instanceof joseErrors.JWKSTimeout || err instanceof joseErrors.JWKSInvalid) return true
  if (err instanceof joseErrors.JOSEError) return err.code === joseErrors.JOSEError.code
  return err instanceof Error
}

export async function verifyMcpRequest(
  req: Request,
  config: McpConfig,
  keys: KeyResolver = keySetFor(config.jwksUrl),
  nowS: number = Math.floor(Date.now() / 1000),
): Promise<AuthResult> {
  const token = readBearer(req)
  if (!token) return unauthorized(config, req.headers.has('authorization') ? 'malformed_header' : 'missing', req.headers.has('authorization'))

  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, keys, {
      algorithms: ['ES256', 'RS256'],
      issuer: config.issuer,
      requiredClaims: ['sub', 'exp', 'iat', 'client_id'],
      currentDate: new Date(nowS * 1000),
    }))
  } catch (err) {
    // An unreachable key set is OUR outage, not the user's bad token: 503, never a reauth loop.
    if (isKeySetOutage(err)) return { ok: false, failure: { status: 503, challenge: null, reason: 'jwks_unavailable' } }
    return unauthorized(config, 'verify_failed', true)
  }

  const bad = checkClaims(payload, config, nowS)
  if (bad) return unauthorized(config, bad, true)

  if (!hasRequiredScopes(payload)) {
    const challenge = bearerChallenge(config, { code: 'insufficient_scope', description: 'The grant is missing a required scope.' })
    return { ok: false, failure: { status: 403, challenge, reason: 'insufficient_scope' } }
  }

  return {
    ok: true,
    auth: {
      userId: (payload.sub as string).toLowerCase(),
      clientId: (payload.client_id as string).toLowerCase(),
      expiresAt: payload.exp as number,
      email: stringClaim(payload, 'email'),
      name: displayName(payload),
    },
  }
}
