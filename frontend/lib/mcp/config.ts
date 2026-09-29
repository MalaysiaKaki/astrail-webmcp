/**
 * Server-only configuration for the remote MCP endpoint (docs/mcp-app/PLAN.md §2, §3).
 *
 * Fails CLOSED: any missing or malformed value makes `loadMcpConfig` return `ok: false`, and the
 * route answers 503. Nothing here is NEXT_PUBLIC_* and nothing is a Supabase service credential —
 * the MCP layer holds no privileged database access (requirement 2).
 */

/**
 * The single scope set used by metadata, tool descriptors, the verifier and every challenge.
 * `openid` only — the same set astrail-app's consent flow and astrail-mcp advertise on this shared
 * Supabase project. get_profile's email/name are optional display fields and never required.
 */
export const MCP_REQUIRED_SCOPES = ['openid'] as const

const MIN_DELEGATION_SECRET_BYTES = 48
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type McpConfig = {
  /** Canonical resource identifier and the exact access-token audience, e.g. https://astrail.xyz/mcp */
  resourceUrl: string
  resourceOrigin: string
  /** RFC 9728 metadata URL advertised in every WWW-Authenticate challenge. */
  metadataUrl: string
  issuer: string
  jwksUrl: string
  allowedClientIds: ReadonlySet<string>
  backendOrigin: string
  delegationSecret: Uint8Array
  /** Browser Origins allowed to call /mcp: the resource origin plus explicit extras. Never request-derived. */
  allowedOrigins: ReadonlySet<string>
}

export type McpConfigResult = { ok: true; config: McpConfig } | { ok: false; problems: string[] }

type Env = Record<string, string | undefined>

function isLoopback(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
}

/** HTTPS always; plain http only for loopback outside production. */
function parseSecureUrl(raw: string | undefined, production: boolean): URL | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.username || url.password || url.hash) return null
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && !production && isLoopback(url)) return url
  return null
}

/** A bare origin: scheme + host (+ port), no path/query/fragment/credentials. */
function parseBareOrigin(raw: string | undefined, production: boolean): string | null {
  const url = parseSecureUrl(raw?.trim(), production)
  if (!url || url.search || (url.pathname !== '/' && url.pathname !== '')) return null
  return url.origin
}

function decodeSecret(raw: string | undefined): Uint8Array | null {
  if (!raw) return null
  const bytes = Buffer.from(raw.trim(), 'base64')
  return bytes.length >= MIN_DELEGATION_SECRET_BYTES ? new Uint8Array(bytes) : null
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export function loadMcpConfig(env: Env = process.env): McpConfigResult {
  const production = env.NODE_ENV === 'production'
  const problems: string[] = []

  const resource = parseSecureUrl(env.MCP_RESOURCE_URL?.trim(), production)
  if (!resource || resource.search || !resource.pathname.endsWith('/mcp')) problems.push('MCP_RESOURCE_URL')

  const issuer = parseSecureUrl(env.MCP_AUTH_ISSUER?.trim(), production)
  if (!issuer) problems.push('MCP_AUTH_ISSUER')

  const jwks = parseSecureUrl(env.MCP_AUTH_JWKS_URL?.trim(), production)
  if (!jwks) problems.push('MCP_AUTH_JWKS_URL')

  const clientIds = splitList(env.MCP_ALLOWED_CLIENT_IDS)
  if (clientIds.length === 0 || !clientIds.every((id) => UUID_RE.test(id))) problems.push('MCP_ALLOWED_CLIENT_IDS')

  const backendOrigin = parseBareOrigin(env.MCP_BACKEND_ORIGIN, production)
  if (!backendOrigin) problems.push('MCP_BACKEND_ORIGIN')

  const secret = decodeSecret(env.MCP_DELEGATION_SECRET)
  if (!secret) problems.push('MCP_DELEGATION_SECRET')

  const extraOrigins = splitList(env.MCP_ALLOWED_ORIGINS).map((o) => parseBareOrigin(o, production))
  if (extraOrigins.some((o) => o === null)) problems.push('MCP_ALLOWED_ORIGINS')

  if (problems.length > 0 || !resource || !issuer || !jwks || !backendOrigin || !secret) {
    return { ok: false, problems }
  }

  // Keep the resource and issuer exactly as configured: they are compared byte-for-byte with the
  // token `aud` (written by the Supabase hook from mcp_oauth_clients.resource) and `iss`.
  const resourceUrl = env.MCP_RESOURCE_URL!.trim()
  return {
    ok: true,
    config: {
      resourceUrl,
      resourceOrigin: resource.origin,
      metadataUrl: `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`,
      issuer: env.MCP_AUTH_ISSUER!.trim(),
      jwksUrl: jwks.toString(),
      allowedClientIds: new Set(clientIds.map((id) => id.toLowerCase())),
      backendOrigin,
      delegationSecret: secret,
      allowedOrigins: new Set([resource.origin, ...(extraOrigins as string[])]),
    },
  }
}
