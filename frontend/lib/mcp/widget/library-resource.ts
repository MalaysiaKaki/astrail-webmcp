/** The Trip Library as an MCP Apps UI resource, with the OpenAI display-mode extension. */
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpConfig } from '../config'
import { LIBRARY_RESOURCE_URI, LIBRARY_V1_RESOURCE_URI } from '../contract'
import { widgetCsp } from './itinerary-resource'

/** Assets are written by build:widgets to public/ (CORS-open via next.config.ts). Same small-shell
 * reason as itinerary v3. A breaking change ships under a new resource URI: v2 adds the live map. */
export const LIBRARY_WIDGET_ASSET_PATH = '/mcp-widget/library/v2'
export const LIBRARY_V1_ASSET_PATH = '/mcp-widget/library/v1'

const LIBRARY_WIDGET_SHELL = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<title>Astrail trips</title>',
  '<link rel="stylesheet" crossorigin="anonymous" href="%ASSET_BASE%/library.css" />',
  '</head>',
  '<body>',
  '<div id="astrail-library-root"></div>',
  '<script type="module" crossorigin="anonymous" src="%ASSET_BASE%/library.js"></script>',
  '</body>',
  '</html>',
  '',
].join('\n')

export function libraryHtml(config: McpConfig, assetPath: string = LIBRARY_WIDGET_ASSET_PATH): string {
  return LIBRARY_WIDGET_SHELL.replace(/%ASSET_BASE%/g, `${config.resourceOrigin}${assetPath}`)
}

/** v2 only: Mapbox GL JS fetches styles/tiles/telemetry from these origins. v1 keeps widgetCsp unchanged. */
function libraryV2Csp(config: McpConfig) {
  const base = widgetCsp(config)
  return {
    connectDomains: ['https://api.mapbox.com', 'https://events.mapbox.com'],
    resourceDomains: [...base.resourceDomains, 'https://api.mapbox.com'],
  }
}

const VARIANTS = [
  { uri: LIBRARY_RESOURCE_URI, name: 'Astrail trips (v2)', assetPath: LIBRARY_WIDGET_ASSET_PATH, csp: libraryV2Csp },
  { uri: LIBRARY_V1_RESOURCE_URI, name: 'Astrail trips', assetPath: LIBRARY_V1_ASSET_PATH, csp: widgetCsp },
]

export function registerLibraryResource(server: McpServer, config: McpConfig): void {
  for (const { uri, name, assetPath, csp: cspFor } of VARIANTS) {
    registerAppResource(
      server,
      name,
      uri,
      { description: "The user's Astrail trips, each readable day by day.", mimeType: RESOURCE_MIME_TYPE },
      async () => {
        const csp = cspFor(config)
        return {
          contents: [{
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: libraryHtml(config, assetPath),
            _meta: {
              ui: { csp, prefersBorder: false },
              'openai/widgetCSP': { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
              'openai/widgetDescription': "Lists the user's Astrail trips and shows the selected one day by day.",
              'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] },
            },
          }],
        }
      },
    )
  }
}
