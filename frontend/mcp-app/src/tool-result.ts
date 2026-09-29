/**
 * Turns a `render_itinerary` tool result into what the widget shows (PLAN §6 step 2).
 *
 * The result is external input like any other: `structuredContent` must match the render summary
 * and `_meta["astrail/bundle"]` the bounded bundle response, and both must describe the SAME trip.
 * Anything else is "Couldn't display this itinerary" — never a half-rendered guess.
 */
import type { AppEventMap } from '@modelcontextprotocol/ext-apps'
import {
  BUNDLE_META_KEY, itineraryResponseSchema, renderSummarySchema,
  type ItineraryResponse,
} from '@/lib/mcp/contract'

export type ToolResult = AppEventMap['toolresult']

export type WidgetData = ItineraryResponse & {
  /** The day the model asked to open on; validated against the view's days before use. */
  focusDay: number | null
}

export type WidgetPhase =
  | { kind: 'waiting' }
  | { kind: 'loading' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }
  | { kind: 'malformed' }
  | { kind: 'ready'; data: WidgetData }

export const GENERIC_ERROR = "Astrail couldn't load this itinerary."

function errorText(result: ToolResult): string {
  const text = (result.content ?? [])
    .flatMap((block) => (block.type === 'text' ? [block.text.trim()] : []))
    .filter(Boolean)
    .join('\n')
  return text || GENERIC_ERROR
}

export function phaseForToolResult(result: ToolResult): WidgetPhase {
  if (result.isError) return { kind: 'error', message: errorText(result) }
  const summary = renderSummarySchema.safeParse(result.structuredContent)
  const response = itineraryResponseSchema.safeParse(result._meta?.[BUNDLE_META_KEY])
  if (!summary.success || !response.success) return { kind: 'malformed' }
  if (summary.data.trip.trip_id !== response.data.bundle.trip.id) return { kind: 'malformed' }
  return { kind: 'ready', data: { ...response.data, focusDay: summary.data.focus_day } }
}
