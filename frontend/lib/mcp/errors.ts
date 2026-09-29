/**
 * Tool-level failures (docs/mcp-app/PLAN.md §2.5, requirement 7).
 *
 * Every failure is `isError: true` with text that is TRUE: no fake success, no "nothing was read"
 * after an upstream that may have read, and no OAuth challenge for faults that reconnecting cannot
 * fix. Messages are fixed strings — never raw upstream bodies or validation dumps (requirement 8).
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { bearerChallenge } from './auth'
import type { McpConfig } from './config'

export type ToolErrorCode =
  | 'reauth_required'
  | 'service_unverified'
  | 'service_unavailable'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'too_large'
  | 'upstream_unavailable'
  | 'invalid_day'
  | 'day_not_in_view'

export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string, readonly retryAfterS?: number) {
    super(message)
    this.name = 'ToolError'
  }
}

export const TOOL_ERROR_TEXT: Record<Exclude<ToolErrorCode, 'invalid_day' | 'day_not_in_view' | 'rate_limited'>, string> = {
  reauth_required: 'Your Astrail connection expired. Reconnect Astrail and try again.',
  service_unverified: "Astrail's service could not verify this request, so no data was returned. This is not a problem with your connection.",
  service_unavailable: "Astrail's service is temporarily unavailable. Try again shortly.",
  forbidden: 'You do not have access to that in Astrail.',
  not_found: 'No trip with that id in your Astrail account. Call list_trips to get a valid trip_id.',
  conflict: 'Astrail reported a conflict with the current state of that trip. Nothing was changed.',
  too_large: 'This trip is too large to show here; open it in Astrail.',
  upstream_unavailable: 'Astrail could not return a usable result right now. Try again shortly.',
}

export function rateLimitedText(retryAfterS?: number): string {
  return retryAfterS ? `Too many requests to Astrail; try again in ${retryAfterS} seconds.` : 'Too many requests to Astrail; try again shortly.'
}

export function toolError(code: keyof typeof TOOL_ERROR_TEXT): ToolError {
  return new ToolError(code, TOOL_ERROR_TEXT[code])
}

/**
 * Convert a thrown value to a tool result. Only `reauth_required` carries
 * `_meta["mcp/www_authenticate"]`: it is the one failure a new OAuth grant actually fixes.
 * Anything that is not a ToolError is reported generically — its message may hold private data.
 */
export function toolErrorResult(err: unknown, config: McpConfig): CallToolResult {
  const toolErr = err instanceof ToolError ? err : toolError('upstream_unavailable')
  const result: CallToolResult = { isError: true, content: [{ type: 'text', text: toolErr.message }] }
  if (toolErr.code === 'reauth_required') {
    result._meta = {
      'mcp/www_authenticate': [
        bearerChallenge(config, { code: 'invalid_token', description: 'The access token expired.' }),
      ],
    }
  }
  return result
}
