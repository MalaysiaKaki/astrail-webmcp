/**
 * `render_itinerary` results as the gateway builds them: the model-visible summary from the real
 * `summarize()` in structuredContent, the bundle response in `_meta["astrail/bundle"]`.
 */
import { BUNDLE_META_KEY, type ItineraryResponse } from '@/lib/mcp/contract'
import { summarize } from '@/lib/mcp/summarize'
import type { ToolResult } from '../tool-result'
import type { WidgetData } from '../tool-result'

export function renderResult(response: ItineraryResponse, focusDay: number | null = null): ToolResult {
  return {
    content: [{ type: 'text', text: 'Itinerary shown.' }],
    structuredContent: { ...summarize(response), focus_day: focusDay },
    _meta: { [BUNDLE_META_KEY]: response },
  }
}

export function widgetData(response: ItineraryResponse, focusDay: number | null = null): WidgetData {
  return { ...response, focusDay }
}
