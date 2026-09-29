/**
 * RFC 9728 protected-resource metadata for /mcp. ChatGPT reads it (via the WWW-Authenticate
 * `resource_metadata` pointer) to find the authorization server and the scopes to request.
 */
import { MCP_REQUIRED_SCOPES, loadMcpConfig } from './config'
import { jsonResponse } from './http-guard'

export function protectedResourceMetadata(env: Record<string, string | undefined> = process.env): Response {
  const loaded = loadMcpConfig(env)
  if (!loaded.ok) return jsonResponse(503, { error: 'server_misconfigured' })
  const { config } = loaded
  return jsonResponse(
    200,
    {
      resource: config.resourceUrl,
      authorization_servers: [config.issuer],
      scopes_supported: [...MCP_REQUIRED_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'Astrail',
      resource_documentation: `${config.resourceOrigin}/privacy`,
    },
    { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  )
}
