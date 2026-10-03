/**
 * SPIKE (throwaway): "Map probe" entrypoint. Opens a widget that tests whether Mapbox GL JS can run
 * inside ChatGPT's widget sandbox. Delete after the live test.
 */
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpConfig } from '../config'
import { MAP_PROBE_RESOURCE_URI } from '../contract'
import { widgetCsp } from '../widget/itinerary-resource'
import { READ_ONLY_ANNOTATIONS, runTool, toolMeta, type ToolContext } from './shared'

export const MAP_PROBE_TOOL = 'open_map_probe'
export const MAP_PROBE_ASSET_PATH = '/mcp-widget/probe/v1'
export const MAP_TOKEN_META_KEY = 'astrail/mapbox_token'

const SHELL = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<title>Astrail map probe</title>',
  '<link rel="stylesheet" crossorigin="anonymous" href="%ASSET_BASE%/probe.css" />',
  '</head>',
  '<body>',
  '<div id="astrail-probe-root"></div>',
  '<script type="module" crossorigin="anonymous" src="%ASSET_BASE%/probe.js"></script>',
  '</body>',
  '</html>',
  '',
].join('\n')

/** Public tokens only: an `sk.` secret must never reach a widget. */
function publicMapboxToken(env: Record<string, string | undefined>): string | null {
  const token = env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN?.trim()
  return token?.startsWith('pk.') ? token : null
}

export function registerMapProbe(server: McpServer, ctx: ToolContext): void {
  registerAppTool(
    server,
    MAP_PROBE_TOOL,
    {
      title: 'Map probe',
      description: 'Developer test: checks whether an interactive map can run here.',
      inputSchema: z.object({}).optional(),
      outputSchema: { ok: z.boolean() },
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Opening map probe…', 'Opened map probe', {
        ui: { resourceUri: MAP_PROBE_RESOURCE_URI, visibility: ['app'] },
        'openai/ui': { entrypoints: [{ type: 'global' }] },
      }),
    },
    async () =>
      runTool(MAP_PROBE_TOOL, ctx, async () => ({
        structuredContent: { ok: true },
        content: [{ type: 'text', text: 'Map probe opened.' }],
        _meta: { [MAP_TOKEN_META_KEY]: publicMapboxToken(process.env) },
      })),
  )
}

export function registerMapProbeResource(server: McpServer, config: McpConfig): void {
  registerAppResource(
    server,
    'Astrail map probe',
    MAP_PROBE_RESOURCE_URI,
    { description: 'Developer test page for an interactive map.', mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const base = widgetCsp(config)
      const csp = {
        connectDomains: ['https://api.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: [...base.resourceDomains, 'https://api.mapbox.com'],
      }
      return {
        contents: [{
          uri: MAP_PROBE_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: SHELL.replace(/%ASSET_BASE%/g, `${config.resourceOrigin}${MAP_PROBE_ASSET_PATH}`),
          _meta: {
            ui: { csp, prefersBorder: false },
            'openai/widgetCSP': { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
            'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['fullscreen'] },
          },
        }],
      }
    },
  )
}
