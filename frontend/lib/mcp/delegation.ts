/**
 * Delegation token for Next.js → FastAPI calls (docs/mcp-app/PLAN.md §2.3).
 *
 * The user's MCP access token is NEVER forwarded (requirement 1). Each backend call instead gets a
 * fresh HS256 JWT bound to one endpoint (`aud`), one body (`bh`), one use (`jti`), and at most 60 s
 * of life that also never outlives the MCP token. The backend verifies everything except the
 * outer-expiry bound, which only this side can enforce because only this side saw the MCP token.
 */
import { createHash, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import type { McpAuth } from './auth'
import type { McpConfig } from './config'

export const DELEGATION_ISSUER = 'astrail-mcp-gateway'
export const DELEGATION_SCOPE = 'mcp:read'
export const DELEGATION_MAX_TTL_S = 60
/** Below this much remaining MCP-token life we refuse to call upstream and ask for reauth. */
export const MIN_OUTER_REMAINING_S = 5

export function bodyHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('base64url')
}

export type Delegation = { ok: true; token: string } | { ok: false; reason: 'outer_token_expiring' }

export async function signDelegation(params: {
  config: McpConfig
  auth: McpAuth
  path: string
  body: Uint8Array
  nowS?: number
}): Promise<Delegation> {
  const { config, auth, path, body } = params
  const nowS = params.nowS ?? Math.floor(Date.now() / 1000)
  if (auth.expiresAt - nowS < MIN_OUTER_REMAINING_S) return { ok: false, reason: 'outer_token_expiring' }

  const exp = Math.min(nowS + DELEGATION_MAX_TTL_S, auth.expiresAt)
  const token = await new SignJWT({ scope: DELEGATION_SCOPE, client_id: auth.clientId, bh: bodyHash(body) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(DELEGATION_ISSUER)
    .setAudience(`${config.backendOrigin}${path}`)
    .setSubject(auth.userId)
    .setJti(randomUUID())
    .setIssuedAt(nowS)
    .setExpirationTime(exp)
    .sign(config.delegationSecret)
  return { ok: true, token }
}
