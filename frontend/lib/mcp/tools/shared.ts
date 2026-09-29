/**
 * What every Astrail MCP tool shares: honest read-only annotations, the OAuth security scheme,
 * and one error/log boundary so no handler can leak a raw exception (requirements 7 and 8).
 */
import { createHash } from 'node:crypto'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { McpAuth } from '../auth'
import { MCP_REQUIRED_SCOPES, type McpConfig } from '../config'
import { ToolError, toolErrorResult } from '../errors'

export type ToolContext = { config: McpConfig; auth: McpAuth; fetchImpl?: typeof fetch }

/** Every v1 tool only reads the user's own bounded account data. */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const

export const SECURITY_SCHEMES = [{ type: 'oauth2', scopes: [...MCP_REQUIRED_SCOPES] }] as const

export function toolMeta(invoking: string, invoked: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    securitySchemes: SECURITY_SCHEMES,
    'openai/toolInvocation/invoking': invoking.slice(0, 64),
    'openai/toolInvocation/invoked': invoked.slice(0, 64),
    ...extra,
  }
}

function subjectTag(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 8)
}

/** Allowlisted fields only: tool, outcome code, latency, a short hash of the subject. */
export function logToolOutcome(tool: string, outcome: string, startedAt: number, auth: McpAuth): void {
  console.info(JSON.stringify({ evt: 'mcp_tool', tool, outcome, ms: Date.now() - startedAt, sub: subjectTag(auth.userId) }))
}

/** Run a handler; any failure becomes an honest `isError` result and a sanitized log line. */
export async function runTool(
  name: string,
  ctx: ToolContext,
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const startedAt = Date.now()
  try {
    const result = await handler()
    logToolOutcome(name, 'ok', startedAt, ctx.auth)
    return result
  } catch (err) {
    logToolOutcome(name, err instanceof ToolError ? err.code : 'internal', startedAt, ctx.auth)
    return toolErrorResult(err, ctx.config)
  }
}
