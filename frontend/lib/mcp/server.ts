/**
 * Builds one McpServer for ONE request (docs/mcp-app/PLAN.md §2.4). The verified identity is
 * captured in closures, so there is no module-level "current user" for concurrent requests to
 * share — two users with identical JSON-RPC ids can never see each other's data.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, type ListToolsResult } from '@modelcontextprotocol/sdk/types.js'
import { SERVER_INSTRUCTIONS } from './instructions'
import { SECURITY_SCHEMES, type ToolContext } from './tools/shared'
import { registerProfileTool } from './tools/profile'
import { registerListTools } from './tools/lists'
import { registerItineraryTools } from './tools/itinerary'
import { registerItineraryResource } from './widget/itinerary-resource'

export const SERVER_INFO = { name: 'astrail', title: 'Astrail', version: '1.0.0' } as const

type Handler = (request: unknown, extra: unknown) => Promise<ListToolsResult>

/**
 * OpenAI reads `securitySchemes` as a top-level tool field, but SDK 1.x `registerTool` keeps only
 * known fields plus `_meta`. Wrap the SDK's own tools/list handler and copy the scheme up, rather
 * than casting it in and hoping. Throws at construction if the SDK internals move — the wire test
 * would catch it too.
 */
function exposeTopLevelSecuritySchemes(server: McpServer): void {
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, Handler> })._requestHandlers
  const original = handlers?.get('tools/list')
  if (!original) throw new Error('MCP SDK tools/list handler not found; cannot expose securitySchemes')
  server.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = await original(request, extra)
    return { ...result, tools: result.tools.map((tool) => ({ ...tool, securitySchemes: SECURITY_SCHEMES })) }
  })
}

export function createAstrailMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {}, resources: {} } })
  registerProfileTool(server, ctx)
  registerListTools(server, ctx)
  registerItineraryTools(server, ctx)
  registerItineraryResource(server, ctx.config)
  exposeTopLevelSecuritySchemes(server)
  return server
}
