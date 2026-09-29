/**
 * get_itinerary (data tool) and render_itinerary (the one render tool) — docs/mcp-app/PLAN.md §5.1.
 *
 * Both re-read the trip from Astrail by trip_id. render_itinerary deliberately does NOT accept
 * itinerary data from the model: the widget only ever shows what Astrail actually stored. The full
 * bundle rides in result `_meta`, which the host gives the widget and hides from the model.
 */
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildTrailNumbers, hasRealCoords, placesForDay } from '@/lib/trip/selectors'
import {
  BUNDLE_META_KEY, ITINERARY_RESOURCE_URI, LINKS_META_KEY, itineraryResponseSchema, itineraryToolInput,
  itinerarySummarySchema, renderSummarySchema, renderToolInput, type ItineraryResponse, type WidgetLinks,
} from '../contract'
import type { McpConfig } from '../config'
import { STATIC_MAP_MAX_PINS, staticMapUrl, type MapPin } from '../static-map'
import { BACKEND_PATHS, callBackend } from '../upstream'
import { assertDayAvailable, itineraryText, summarize } from '../summarize'
import { READ_ONLY_ANNOTATIONS, runTool, toolMeta, type ToolContext } from './shared'

async function loadItinerary(ctx: ToolContext, tripId: string, day?: number): Promise<ItineraryResponse> {
  const body = { trip_id: tripId, ...(day !== undefined ? { day } : {}) }
  const resp = await callBackend(ctx, BACKEND_PATHS.itinerary, body, itineraryResponseSchema)
  if (day !== undefined) assertDayAvailable(resp, day)
  return resp
}

/**
 * The widget's links, built HERE from configuration and the re-read bundle — never from model
 * input. `trip_url` opens the trip in Astrail. `day_maps` (only when the Mapbox token is set) gives
 * each day with located stops a signed route-map URL: its pins in stop order, each labelled with
 * the trail number its card shows, capped at STATIC_MAP_MAX_PINS.
 */
export function widgetLinks(config: McpConfig, resp: ItineraryResponse, nowS = Math.floor(Date.now() / 1000)): WidgetLinks {
  const { bundle } = resp
  const tripUrl = `${config.resourceOrigin}/app/trip/${encodeURIComponent(bundle.trip.id)}`
  if (!config.mapboxStaticToken) return { trip_url: tripUrl }
  const trail = buildTrailNumbers(bundle)
  const dayMaps: Record<string, string> = {}
  for (const day of bundle.days) {
    const pins: MapPin[] = placesForDay(bundle, day.day_number)
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat) && trail.has(tp.id))
      .slice(0, STATIC_MAP_MAX_PINS)
      .map((tp) => [tp.place.lng, tp.place.lat, trail.get(tp.id)!])
    if (pins.length > 0) {
      dayMaps[String(day.day_number)] = staticMapUrl(config.resourceOrigin, config.delegationSecret, pins, nowS)
    }
  }
  return { trip_url: tripUrl, day_maps: dayMaps }
}

export function registerItineraryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_itinerary',
    {
      title: 'Get trip itinerary',
      description:
        "Read one trip's itinerary: days, stops with their evidence, transport notes, restaurants and hotels. Pass the full trip_id from list_trips; pass `day` to read a single day.",
      inputSchema: itineraryToolInput,
      outputSchema: itinerarySummarySchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Reading your itinerary…', 'Read your itinerary'),
    },
    async ({ trip_id, day }) =>
      runTool('get_itinerary', ctx, async () => {
        const summary = summarize(await loadItinerary(ctx, trip_id, day), day)
        return { structuredContent: summary, content: [{ type: 'text', text: itineraryText(summary) }] }
      }),
  )

  registerAppTool(
    server,
    'render_itinerary',
    {
      title: 'Show itinerary card',
      description:
        'Show a trip itinerary as an interactive card with a day picker. Call get_itinerary first to confirm the trip_id; this re-reads the trip from Astrail and renders it.',
      inputSchema: renderToolInput,
      outputSchema: renderSummarySchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: toolMeta('Opening your itinerary…', 'Opened your itinerary', { ui: { resourceUri: ITINERARY_RESOURCE_URI } }),
    },
    async ({ trip_id, focus_day }) =>
      runTool('render_itinerary', ctx, async () => {
        const resp = await loadItinerary(ctx, trip_id, focus_day)
        const summary = { ...summarize(resp), focus_day: focus_day ?? null }
        return {
          structuredContent: summary,
          content: [{ type: 'text', text: itineraryText(summary) }],
          _meta: { [BUNDLE_META_KEY]: resp, [LINKS_META_KEY]: widgetLinks(ctx.config, resp) },
        }
      }),
  )
}
