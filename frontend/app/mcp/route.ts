// Remote MCP endpoint (Streamable HTTP, stateless, JSON responses) for ChatGPT and other MCP hosts.
// All logic lives in lib/mcp/handler.ts; see docs/mcp-app/PLAN.md. Browser WebMCP is separate
// (lib/webmcp) and unaffected.
import { handleMcpOptions, handleMcpPost, methodNotAllowed } from '@/lib/mcp/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(req: Request): Promise<Response> {
  return handleMcpPost(req)
}

export function OPTIONS(req: Request): Response {
  return handleMcpOptions(req)
}

// No server-initiated SSE stream and no sessions: GET and DELETE are 405 (Streamable HTTP permits this).
export function GET(): Response {
  return methodNotAllowed()
}

export function DELETE(): Response {
  return methodNotAllowed()
}
