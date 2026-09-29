/**
 * `render_itinerary` results as the gateway builds them: the model-visible summary from the real
 * `summarize()` in structuredContent, the bundle response in `_meta["astrail/bundle"]`, and the
 * links (when given) in `_meta["astrail/links"]`.
 */
import { BUNDLE_META_KEY, LINKS_META_KEY, type ItineraryResponse, type WidgetLinks } from '@/lib/mcp/contract'
import { summarize } from '@/lib/mcp/summarize'
import type { ToolResult } from '../tool-result'
import type { WidgetData } from '../tool-result'

export function renderResult(
  response: ItineraryResponse,
  focusDay: number | null = null,
  links: WidgetLinks | null = null,
): ToolResult {
  return {
    content: [{ type: 'text', text: 'Itinerary shown.' }],
    structuredContent: { ...summarize(response), focus_day: focusDay },
    _meta: { [BUNDLE_META_KEY]: response, ...(links ? { [LINKS_META_KEY]: links } : {}) },
  }
}

export function widgetData(
  response: ItineraryResponse,
  focusDay: number | null = null,
  links: WidgetLinks | null = null,
): WidgetData {
  return { ...response, focusDay, links }
}

/** Links as render_itinerary mints them for the fixture trip: Day 1 and Day 2 have located stops. */
export function fixtureLinks(tripId: string, days: number[] = [1, 2]): WidgetLinks {
  return {
    trip_url: `https://astrail.test/app/trip/${tripId}`,
    day_maps: Object.fromEntries(days.map((d) => [String(d), `https://astrail.test/api/mcp/static-map?p=day${d}&s=sig`])),
  }
}
