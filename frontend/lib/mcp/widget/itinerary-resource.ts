/**
 * The itinerary widget as an MCP Apps UI resource (docs/mcp-app/PLAN.md §6).
 *
 * The HTML is the single-file Vite build, inlined as a string at build time (`npm run
 * build:widgets` writes ./generated/itinerary-v1.ts). A missing build is a compile error, not a
 * blank widget. The URI is versioned: a breaking HTML/JS/CSS change ships as itinerary-v2.
 */
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpConfig } from '../config'
import { ITINERARY_RESOURCE_URI } from '../contract'
import { ITINERARY_WIDGET_HTML } from './generated/itinerary-v1'

/**
 * Where Reel covers load from. The widget never fetches (connectDomains is empty); it only shows
 * images. Instagram serves covers from its CDNs; stored copies come from the project's Supabase.
 */
const COVER_DOMAINS = ['https://*.cdninstagram.com', 'https://*.fbcdn.net'] as const

export function widgetCsp(config: McpConfig) {
  return {
    connectDomains: [] as string[],
    resourceDomains: [...COVER_DOMAINS, new URL(config.issuer).origin],
  }
}

export function registerItineraryResource(server: McpServer, config: McpConfig): void {
  registerAppResource(
    server,
    'Astrail itinerary',
    ITINERARY_RESOURCE_URI,
    { description: 'Interactive day-by-day card for one Astrail trip.', mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: ITINERARY_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: ITINERARY_WIDGET_HTML,
          _meta: {
            ui: { csp: widgetCsp(config), prefersBorder: true },
            'openai/widgetDescription':
              "Shows the user's Astrail trip day by day: stops with their source evidence, transport notes, restaurants and hotels.",
          },
        },
      ],
    }),
  )
}
