/**
 * The itinerary widget as an MCP Apps UI resource (docs/mcp-app/PLAN.md §6).
 *
 * v3: the resource is a small HTML shell (well under 10 KB) that loads itinerary.js and
 * itinerary.css from `<resource origin>/mcp-widget/v3/` (public/, served with CORS by
 * next.config.ts). v2 inlined the whole ~735 KB build, and ChatGPT's widget service failed on it
 * (HTTP 500, "Could not open this app"). `npm run build:widgets` writes the shell module and the
 * assets together; a missing build is a compile error, not a blank widget. The URI is versioned:
 * a breaking HTML/JS/CSS change ships as the next version (hosts cache resources by URI).
 */
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpConfig } from '../config'
import { ITINERARY_RESOURCE_URI } from '../contract'
import { ITINERARY_WIDGET_ASSET_PATH, ITINERARY_WIDGET_SHELL } from './generated/itinerary-v3'

const ASSET_BASE = /%ASSET_BASE%/g

/** Where the widget's JS and CSS are served from, e.g. https://astrail.xyz/mcp-widget/v3 */
export function widgetAssetBase(config: McpConfig): string {
  return `${config.resourceOrigin}${ITINERARY_WIDGET_ASSET_PATH}`
}

/** The resource text: the build's shell with absolute asset URLs on our configured origin. */
export function widgetHtml(config: McpConfig): string {
  return ITINERARY_WIDGET_SHELL.replace(ASSET_BASE, widgetAssetBase(config))
}

/**
 * The widget never fetches (connectDomains is empty). It loads its own JS/CSS from our origin and
 * shows Reel covers, which come from Instagram's CDNs (MCP_WIDGET_IMAGE_DOMAINS) or from the
 * copies backend/pipeline/thumbnails.py stores in the project's public Supabase Storage (the
 * issuer's origin) — so that origin stays, whatever the image-domain setting.
 */
export function widgetCsp(config: McpConfig) {
  const resourceDomains = [...new Set([
    config.resourceOrigin,
    new URL(config.issuer).origin,
    ...config.widgetImageDomains,
  ])]
  return { connectDomains: [] as string[], resourceDomains }
}

export function registerItineraryResource(server: McpServer, config: McpConfig): void {
  registerAppResource(
    server,
    'Astrail itinerary',
    ITINERARY_RESOURCE_URI,
    { description: 'Interactive day-by-day card for one Astrail trip.', mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const csp = widgetCsp(config)
      return {
        contents: [
          {
            uri: ITINERARY_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: widgetHtml(config),
            _meta: {
              ui: { csp, prefersBorder: true },
              // ChatGPT's documented compatibility key for the same policy.
              'openai/widgetCSP': { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
              'openai/widgetDescription':
                "Shows the user's Astrail trip day by day: stops with their source evidence, transport notes, restaurants and hotels.",
            },
          },
        ],
      }
    },
  )
}
