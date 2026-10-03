/** The Trip Library as an MCP Apps UI resource, with the OpenAI display-mode extension. */
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpConfig } from '../config'
import { LIBRARY_RESOURCE_URI } from '../contract'
import { widgetCsp } from './itinerary-resource'

/** Assets are written by build:widgets to public/ (CORS-open via next.config.ts). Same small-shell
 * reason as itinerary v3. A breaking change ships as v2 under a new resource URI. */
export const LIBRARY_WIDGET_ASSET_PATH = '/mcp-widget/library/v1'

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

export function libraryHtml(config: McpConfig): string {
  return LIBRARY_WIDGET_SHELL.replace(/%ASSET_BASE%/g, `${config.resourceOrigin}${LIBRARY_WIDGET_ASSET_PATH}`)
}

export function registerLibraryResource(server: McpServer, config: McpConfig): void {
  registerAppResource(
    server,
    'Astrail trips',
    LIBRARY_RESOURCE_URI,
    { description: "The user's Astrail trips, each readable day by day.", mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const csp = widgetCsp(config)
      return {
        contents: [{
          uri: LIBRARY_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: libraryHtml(config),
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
