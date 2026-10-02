/**
 * The Trip Library entrypoints (OpenAI MCP Extensions): "Astrail" in the ChatGPT sidebar and a
 * "Trips" panel beside a conversation. Both open the same UI with the newest trips; the UI opens
 * a trip through render_itinerary, which re-reads it as the signed-in user.
 */
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LIBRARY_RESOURCE_URI, MCP_LIMITS, tripsPageSchema } from '../contract'
import { BACKEND_PATHS, callBackend } from '../upstream'
import { listBody, tripsText } from './lists'
import { READ_ONLY_ANNOTATIONS, runTool, toolMeta, type ToolContext } from './shared'

export const LIBRARY_TOOLS = { global: 'open_trip_library', thread: 'open_trip_panel' } as const

// Spec "Icon Guidelines": SVG, monochrome, transparent, currentColor, 20x20 viewport, 1.33px strokes.
// SDK 1.x registerTool drops `icons`, so server.ts adds them in its tools/list wrapper.
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17.5s-5.5-4.7-5.5-9.2a5.5 5.5 0 0 1 11 0c0 4.5-5.5 9.2-5.5 9.2z"/><circle cx="10" cy="8.3" r="2"/></svg>'
export const LIBRARY_TOOL_ICONS = [{ src: `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`, mimeType: 'image/svg+xml', sizes: ['any'] }]

const ENTRYPOINTS = [
  { name: LIBRARY_TOOLS.global, title: 'Astrail', description: 'Open your Astrail trips and read any of them day by day.', entrypoint: { type: 'global' } },
  { name: LIBRARY_TOOLS.thread, title: 'Trips', description: 'Open your Astrail trips beside this conversation.', entrypoint: { type: 'thread' } },
]

export function registerLibraryTools(server: McpServer, ctx: ToolContext): void {
  for (const { name, title, description, entrypoint } of ENTRYPOINTS) {
    registerAppTool(
      server,
      name,
      {
        title,
        description,
        // NOT `{}`: SDK 1.31 validates `undefined` against z.object({}) and rejects an omitted
        // `arguments`. `.optional()` lists as {"type":"object","properties":{}} and accepts both.
        inputSchema: z.object({}).optional(),
        outputSchema: tripsPageSchema.shape,
        annotations: READ_ONLY_ANNOTATIONS,
        // OpenAI MCP Extensions (github.com/openai/mcp-extensions docs/spec.md): app-only, the
        // model keeps list_trips/render_itinerary; visibility is ignored when opened as an entrypoint.
        _meta: toolMeta('Opening your trips…', 'Opened your trips', {
          ui: { resourceUri: LIBRARY_RESOURCE_URI, visibility: ['app'] },
          'openai/ui': { entrypoints: [entrypoint] },
          'openai/iconStyle': 'monochrome',
        }),
      },
      async () =>
        runTool(name, ctx, async () => {
          const page = await callBackend(ctx, BACKEND_PATHS.tripsList, listBody({ limit: MCP_LIMITS.listMax }), tripsPageSchema)
          return { structuredContent: page, content: [{ type: 'text', text: tripsText(page) }] }
        }),
    )
  }
}
