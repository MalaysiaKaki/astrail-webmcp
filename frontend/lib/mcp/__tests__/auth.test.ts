// @vitest-environment node
/**
 * Access-token verification matrix (docs/mcp-app/PLAN.md §3 requirement 3, §7.1 "Auth").
 */
import { SignJWT, createRemoteJWKSet, customFetch } from 'jose'
import { describe, expect, it } from 'vitest'
import { verifyMcpRequest } from '../auth'
import { loadMcpConfig, type McpConfig } from '../config'
import { CLIENT_ID, ENV, RESOURCE, USER_ID, mintToken, nowS, testKeys } from './helpers'

const config = (() => {
  const loaded = loadMcpConfig(ENV)
  if (!loaded.ok) throw new Error('test config invalid')
  return loaded.config
})() as McpConfig

async function verify(token: string | null, headerOverride?: string) {
  const { keys } = await testKeys()
  const headers: Record<string, string> = {}
  if (headerOverride !== undefined) headers.Authorization = headerOverride
  else if (token) headers.Authorization = `Bearer ${token}`
  return verifyMcpRequest(new Request(RESOURCE, { method: 'POST', headers }), config, keys)
}

describe('verifyMcpRequest', () => {
  it('accepts a valid ES256 token and resolves identity from it', async () => {
    const result = await verify(await mintToken())
    expect(result).toMatchObject({ ok: true, auth: { userId: USER_ID, clientId: CLIENT_ID, email: 'traveller@example.com', name: 'Test Traveller' } })
  })

  it('missing token → 401 with a plain challenge (no error param)', async () => {
    const result = await verify(null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.status).toBe(401)
      expect(result.failure.challenge).not.toContain('error=')
    }
  })

  it('a malformed Authorization header → 401 invalid_token', async () => {
    const result = await verify(null, 'Basic abc')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.challenge).toContain('error="invalid_token"')
  })

  const invalid: [string, () => Promise<string>][] = [
    ['HS256-signed with a guessable secret', () =>
      new SignJWT({ aud: RESOURCE, sub: USER_ID, client_id: CLIENT_ID, role: 'astrail_mcp_resource', astrail_mcp_access: true, scope: 'openid' })
        .setProtectedHeader({ alg: 'HS256', kid: 'test-key' }).setIssuer(ENV.MCP_AUTH_ISSUER).setIssuedAt().setExpirationTime('1h')
        .sign(new TextEncoder().encode('x'.repeat(64)))],
    ['alg none', async () => {
      const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
      return `${b64({ alg: 'none' })}.${b64({ iss: ENV.MCP_AUTH_ISSUER, aud: RESOURCE, sub: USER_ID })}.`
    }],
    ['wrong issuer', () => mintToken({ iss: 'https://evil.example/auth/v1' })],
    ['audience array containing the resource', () => mintToken({ aud: [RESOURCE, 'authenticated'] })],
    ['browser-session audience', () => mintToken({ aud: 'authenticated' })],
    ['expired', () => mintToken({ exp: nowS() - 30, iat: nowS() - 3600 })],
    ['iat far in the future', () => mintToken({ iat: nowS() + 600, exp: nowS() + 4000 })],
    ['missing sub', () => mintToken({}, ['sub'])],
    ['non-UUID sub', () => mintToken({ sub: 'not-a-uuid' })],
    ['missing exp', () => mintToken({}, ['exp'])],
    ['missing iat', () => mintToken({}, ['iat'])],
    ['missing client_id', () => mintToken({}, ['client_id'])],
    ['non-UUID client_id', () => mintToken({ client_id: 'chatgpt' })],
    ['client not allowlisted', () => mintToken({ client_id: '99999999-9999-4999-8999-999999999999' })],
    ['role missing', () => mintToken({}, ['role'])],
    ['browser-session role', () => mintToken({ role: 'authenticated' })],
    ['permission missing', () => mintToken({}, ['astrail_mcp_access'])],
    ['permission as a string', () => mintToken({ astrail_mcp_access: 'true' })],
    // Same shared hook, other server: an astrail-mcp token must never open this resource.
    ['a token minted for astrail-mcp', () => mintToken({ aud: 'https://astrail-mcp.vercel.app/mcp' })],
  ]

  it.each(invalid)('rejects %s with 401 invalid_token', async (_label, make) => {
    const result = await verify(await make())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.status).toBe(401)
      expect(result.failure.challenge).toContain('error="invalid_token"')
      expect(result.failure.challenge).toContain('resource_metadata="https://astrail.test/.well-known/oauth-protected-resource/mcp"')
    }
  })

  it.each([
    ['missing scope claim', () => mintToken({}, ['scope'])],
    ['scope not a string', () => mintToken({ scope: ['openid'] })],
    ['missing openid', () => mintToken({ scope: 'email profile' })],
  ] as [string, () => Promise<string>][])('%s → 403 insufficient_scope', async (_label, make) => {
    const result = await verify(await make())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.status).toBe(403)
      expect(result.failure.challenge).toContain('error="insufficient_scope"')
    }
  })

  it('accepts reordered scopes and harmless extras', async () => {
    expect((await verify(await mintToken({ scope: 'profile offline_access email openid' }))).ok).toBe(true)
  })

  it('a token signed by an unknown key is 401, not 503', async () => {
    const { generateKeyPair } = await import('jose')
    const { privateKey } = await generateKeyPair('ES256')
    const token = await new SignJWT({ aud: RESOURCE, sub: USER_ID, client_id: CLIENT_ID, role: 'astrail_mcp_resource', astrail_mcp_access: true, scope: 'openid' })
      .setProtectedHeader({ alg: 'ES256', kid: 'other-key' }).setIssuer(ENV.MCP_AUTH_ISSUER).setIssuedAt().setExpirationTime('1h')
      .sign(privateKey)
    const result = await verify(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.status).toBe(401)
  })
})

describe('verifyMcpRequest against the real remote JWKS resolver', () => {
  const resolverWith = (respond: () => Response) =>
    createRemoteJWKSet(new URL(ENV.MCP_AUTH_JWKS_URL), { [customFetch]: async () => respond() })

  it.each([
    ['HTTP 503 from the JWKS endpoint', () => new Response('down', { status: 503 })],
    ['a 200 that is not JSON', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['a 200 JSON that is not a key set', () => Response.json({ nope: true })],
  ] as [string, () => Response][])('%s → 503 without a reauth challenge', async (_label, respond) => {
    const token = await mintToken()
    const req = new Request(RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const result = await verifyMcpRequest(req, config, resolverWith(respond))
    expect(result).toMatchObject({ ok: false, failure: { status: 503, challenge: null } })
  })

  it('a healthy key set without the token kid is still 401 (token fault, not outage)', async () => {
    const { jwk } = await testKeys()
    const token = await mintToken()
    const req = new Request(RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const result = await verifyMcpRequest(req, config, resolverWith(() => Response.json({ keys: [{ ...jwk, kid: 'rotated' }] })))
    expect(result).toMatchObject({ ok: false, failure: { status: 401 } })
  })

  it('a healthy key set with the right key verifies', async () => {
    const { jwk } = await testKeys()
    const token = await mintToken()
    const req = new Request(RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect((await verifyMcpRequest(req, config, resolverWith(() => Response.json({ keys: [jwk] })))).ok).toBe(true)
  })
})
