/**
 * get_profile — the OpenAI multi-account identity tool (docs/mcp-app/PLAN.md §5.1).
 *
 * Resolved entirely from the verified access token: `id` is the Supabase user UUID, which is
 * stable across refresh/reconnect and never reassigned. No backend call, no invented nickname.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { profileOutput } from '../contract'
import { READ_ONLY_ANNOTATIONS, runTool, toolMeta, type ToolContext } from './shared'

export function registerProfileTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_profile',
    {
      title: 'Get Astrail profile',
      description:
        "Return the Astrail account this connection is signed in as. The opaque id is the user's stable Astrail id and does not change across token refresh, reconnection, or name/email changes.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object(profileOutput).strict(),
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Checking your Astrail account…', 'Checked your Astrail account', { 'openai/profile': true }),
    },
    async () =>
      runTool('get_profile', ctx, async () => {
        const profile = {
          id: ctx.auth.userId,
          ...(ctx.auth.name ? { name: ctx.auth.name } : {}),
          ...(ctx.auth.email ? { email: ctx.auth.email } : {}),
        }
        return { structuredContent: profile, content: [{ type: 'text', text: JSON.stringify(profile) }] }
      }),
  )
}
