/**
 * list_trips and list_saved_reels — paginated data tools with no UI (docs/mcp-app/PLAN.md §5.1).
 * Full UUIDs in both structured and text output, so follow-up calls never guess a prefix.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  MCP_LIMITS, listToolInput, savedReelsPageSchema, tripsPageSchema, type SavedReelsPage, type TripsPage,
} from '../contract'
import { BACKEND_PATHS, callBackend } from '../upstream'
import { UNTRUSTED_NOTE } from '../summarize'
import { READ_ONLY_ANNOTATIONS, runTool, toolMeta, type ToolContext } from './shared'

type ListArgs = { limit?: number; cursor?: string }

function listBody(args: ListArgs): Record<string, unknown> {
  return { limit: args.limit ?? MCP_LIMITS.listDefault, ...(args.cursor ? { cursor: args.cursor } : {}) }
}

function moreLine(nextCursor: string | null): string[] {
  return nextCursor ? [`More available: call again with cursor "${nextCursor}".`] : []
}

export function tripsText(page: TripsPage): string {
  if (page.trips.length === 0) return 'No trips in this Astrail account yet.'
  const rows = page.trips.map((t) =>
    `- ${t.title ?? 'Untitled trip'}${t.destination ? ` — ${t.destination}` : ''} · ${t.start_date ?? '?'} to ${t.end_date ?? '?'} · ${t.day_count} days · ${t.status} · trip_id ${t.trip_id}`)
  return [`${page.trips.length} trip(s):`, UNTRUSTED_NOTE, ...rows, ...moreLine(page.next_cursor)].join('\n')
}

export function reelsText(page: SavedReelsPage): string {
  if (page.reels.length === 0) return 'No saved Reels in this Astrail account yet.'
  const rows = page.reels.map((r) => {
    const places = r.places.map((p) => p.name).join(', ')
    const more = r.place_count > r.places.length ? ` (+${r.place_count - r.places.length} more)` : ''
    return `- ${r.platform} ${r.kind}${r.shortcode ? ` ${r.shortcode}` : ''} · ${r.status} · saved ${r.saved_at}${places ? ` · places: ${places}${more}` : ''}`
  })
  return [`${page.reels.length} saved Reel(s):`, UNTRUSTED_NOTE, ...rows, ...moreLine(page.next_cursor)].join('\n')
}

export function registerListTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_trips',
    {
      title: 'List trips',
      description:
        "List the signed-in user's Astrail trips, newest first, with their full trip_id, dates, destination and status. Use this first whenever the user refers to a trip, then pass the trip_id to get_itinerary.",
      inputSchema: listToolInput,
      outputSchema: tripsPageSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Loading your trips…', 'Loaded your trips'),
    },
    async (args) =>
      runTool('list_trips', ctx, async () => {
        const page = await callBackend(ctx, BACKEND_PATHS.tripsList, listBody(args), tripsPageSchema)
        return { structuredContent: page, content: [{ type: 'text', text: tripsText(page) }] }
      }),
  )

  server.registerTool(
    'list_saved_reels',
    {
      title: 'List saved Reels',
      description:
        "List the Instagram Reels and posts the user saved in Astrail, newest first, with their analysis status and the places Astrail verified in each. Read-only: it does not save or analyse anything.",
      inputSchema: listToolInput,
      outputSchema: savedReelsPageSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Loading your saved Reels…', 'Loaded your saved Reels'),
    },
    async (args) =>
      runTool('list_saved_reels', ctx, async () => {
        const page = await callBackend(ctx, BACKEND_PATHS.savedReelsList, listBody(args), savedReelsPageSchema)
        return { structuredContent: page, content: [{ type: 'text', text: reelsText(page) }] }
      }),
  )
}
