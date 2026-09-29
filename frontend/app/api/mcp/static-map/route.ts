// Per-day route map images for the ChatGPT itinerary widget: verifies a signed payload minted by
// render_itinerary and proxies one Mapbox Static Images request. All logic lives in
// lib/mcp/static-map-route.ts; GET only (Next answers 405 for other methods).
import { handleStaticMap } from '@/lib/mcp/static-map-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request): Promise<Response> {
  return handleStaticMap(req)
}
