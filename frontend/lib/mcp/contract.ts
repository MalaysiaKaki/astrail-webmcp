/**
 * Wire contract for the remote MCP surface (docs/mcp-app/PLAN.md §5).
 *
 * Three consumers share this file, so it is the single source of truth on the TS side:
 *   - the Next.js gateway validates every FastAPI response against these schemas;
 *   - the MCP tools declare their input/output schemas from them;
 *   - the widget (frontend/mcp-app) validates the bundle it receives in `_meta`.
 * backend/models/mcp.py mirrors it field for field (CLAUDE.md guardrail #4).
 *
 * The bundle deliberately reuses the EXISTING row types from backend-types.ts, so the unchanged
 * trip components accept it without casts. Where the MCP projection does not carry a field, it
 * sends a documented default the type already permits (MCP_BUNDLE_DEFAULTS) — never invented data.
 */
import { z } from 'zod'
import type {
  HotelSuggestion, Place, RestaurantSuggestion, Trip, TripBundle, TripDay, TripInspirationItem,
  TripPlace, TransportLeg,
} from '@/lib/trip/backend-types'

// ---- Limits (mirrored in backend/mcp_reads.py) ----

export const MCP_LIMITS = {
  listDefault: 20,
  listMax: 50,
  cursorMaxChars: 128,
  maxDay: 30,
  days: 30,
  stops: 200,
  legs: 300,
  restaurants: 60,
  suggestionPlaces: 120,
  hotels: 10,
  inspiration: 60,
  reelPlaces: 10,
  nameChars: 120,
  textChars: 280,
  warningChars: 160,
  titleChars: 160,
  urlChars: 512,
  bundleBytes: 256 * 1024,
  /** Pins on one day's static route map (lib/mcp/static-map.ts); the widget captions a capped map. */
  mapPins: 25,
} as const

/** Fields the MCP projection never carries, and the value it sends instead. Pinned by tests. */
export const MCP_BUNDLE_DEFAULTS = {
  'events': 'always [] — generation events never cross the MCP boundary',
  'trip.tradeoffs': 'always {notes:[],comparisons:[]} — not rendered by the widget',
  'places[].place.source_summary': 'always {} — internal enrichment metadata',
  'suggestion_places[].source_summary': 'always {} — internal enrichment metadata',
  'days[].weather_payload': 'always {} — the widget renders weather_summary only',
  'transport_legs[].route_geometry': 'always null — v1 has no map',
  'restaurants[].evidence_json': 'always {}',
  'restaurants[].preference_match_json': 'always {}',
  'hotels[].preference_match_json': 'always {}',
  'hotels[].place_durations': 'always {}',
  'hotels[].price_snapshot': 'only currency / pricePerNight / totalPrice are kept',
} as const

// ---- Primitives ----

export const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoInstant = z.string().min(1).max(64)
const emptyRecord = z.record(z.string(), z.unknown()).refine((r) => Object.keys(r).length === 0, 'must be {}')
const record = z.record(z.string(), z.unknown())
export const cursor = z.string().min(1).max(MCP_LIMITS.cursorMaxChars).regex(/^[A-Za-z0-9_-]+$/)

// ---- Row schemas (each must stay assignable to its backend-types row; see _assignable below) ----

const tripStatus = z.enum(['draft', 'generating', 'places_ready', 'complete', 'saved_with_gaps', 'failed'])
const placeType = z.enum(['attraction', 'restaurant', 'hotel', 'area', 'city', 'country', 'station', 'shop', 'other'])
const evidenceKind = z.enum([
  'reel_quote', 'requested_by_you', 'research', 'mapbox_route', 'open_meteo',
  'travala_hotel_search', 'memory_preference', 'inferred_default', 'suggested_by_astrail',
])

export const placeSchema = z.object({
  id: uuid,
  name: z.string(),
  name_local: z.string().nullable(),
  place_type: placeType,
  lat: z.number(),
  lng: z.number(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  area: z.string().nullable(),
  aliases: z.array(z.string()),
  source_summary: emptyRecord,
})

export const tripSchema = z.object({
  id: uuid,
  user_id: uuid,
  status: tripStatus,
  destination_hint: z.string().nullable(),
  inferred_destination: z.string().nullable(),
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  origin_city: z.string().nullable(),
  budget_level: z.enum(['budget', 'mid_range', 'premium', 'luxury']).nullable(),
  adult_count: z.number().int(),
  child_count: z.number().int(),
  room_count: z.number().int(),
  preference_sources: z.array(z.enum(['explicit', 'memory', 'inferred_default'])),
  preference_summary: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  tradeoffs: z.object({ notes: z.array(z.never()).max(0), comparisons: z.array(z.never()).max(0) }),
  created_at: isoInstant,
  updated_at: isoInstant,
})

export const inspirationSchema = z.object({
  id: z.string(),
  trip_id: uuid,
  item_type: z.enum(['reel_url', 'requested_place']),
  source: z.enum(['manual_paste', 'clipboard', 'web_share_target', 'manual_input']),
  normalized_reel_url: z.string().nullable(),
  reel_cache_id: z.string().nullable(),
  requested_place_text: z.string().nullable(),
  resolved_place_id: z.string().nullable(),
  status: z.enum([
    'valid', 'invalid', 'duplicate', 'queued', 'cached', 'processing', 'places_found', 'needs_review',
    'failed', 'pending_resolution', 'resolved', 'ambiguous', 'unresolved',
  ]),
  thumbnail_url: z.string().nullable(),
})

export const tripPlaceSchema = z.object({
  id: uuid,
  trip_id: uuid,
  place_id: uuid,
  source_type: z.enum(['reel_extracted', 'user_requested', 'agent_suggested']),
  evidence_json: z.object({
    confidence: z.number(),
    source_url: z.string().nullable(),
    source_reel_url: z.string().nullable().optional(),
    quote: z.string().nullable(),
    quotes: z.array(z.string()),
    rationale: z.string().nullable(),
    evidence_kind: evidenceKind,
  }),
  day_number: z.number().int().nullable(),
  sort_order: z.number().int().nullable(),
  place: placeSchema,
})

export const tripDaySchema = z.object({
  id: uuid,
  trip_id: uuid,
  day_number: z.number().int(),
  day_date: isoDate.nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  weather_summary: z.string().nullable(),
  weather_source: z.enum(['open_meteo', 'manual', 'none']).nullable(),
  weather_payload: emptyRecord,
})

export const transportLegSchema = z.object({
  id: uuid,
  trip_id: uuid,
  trip_day_id: uuid.nullable(),
  from_place_id: uuid.nullable(),
  to_place_id: uuid.nullable(),
  leg_order: z.number().int(),
  transport_mode: z.enum(['walk', 'drive', 'cycle', 'transit_hint', 'unknown']),
  routing_provider: z.enum(['mapbox', 'manual', 'none']),
  routing_profile: z.enum(['walking', 'driving', 'driving-traffic', 'cycling']).nullable(),
  status: z.enum(['pending', 'ok', 'no_route', 'failed', 'skipped']),
  duration_seconds: z.number().nullable(),
  distance_meters: z.number().nullable(),
  route_geometry: z.null(),
  warning: z.string().nullable(),
})

export const restaurantSchema = z.object({
  id: uuid,
  trip_id: uuid,
  trip_day_id: uuid.nullable(),
  restaurant_place_id: uuid.nullable(),
  near_place_id: uuid.nullable(),
  cuisine: z.string().nullable(),
  summary: z.string(),
  source_url: z.string().nullable(),
  evidence_json: emptyRecord,
  preference_match_json: emptyRecord,
})

export const hotelSchema = z.object({
  id: uuid,
  trip_id: uuid,
  trip_day_id: uuid.nullable(),
  base_place_id: uuid.nullable(),
  name: z.string(),
  area: z.string().nullable(),
  star_rating: z.number().nullable(),
  price_snapshot: z.object({
    currency: z.string().optional(),
    pricePerNight: z.number().optional(),
    totalPrice: z.number().optional(),
  }).strict(),
  travala_hotel_id: z.string().nullable(),
  guest_rating: z.number().nullable(),
  refundable: z.boolean().nullable(),
  free_cancellation_until: z.string().nullable(),
  preference_match_json: emptyRecord,
  source: z.enum(['travala', 'manual', 'agent']),
  status: z.enum(['suggested', 'unavailable', 'skipped', 'failed']),
  searched_at: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  geo_status: z.enum(['placed', 'unresolved']),
  route_score: z.number().nullable(),
  rank: z.number().int().nullable(),
  is_recommended: z.boolean(),
  place_durations: z.record(z.string(), z.number()).refine((r) => Object.keys(r).length === 0, 'must be {}'),
})

export const mcpTripBundleSchema = z.object({
  trip: tripSchema,
  inspiration: z.array(inspirationSchema).max(MCP_LIMITS.inspiration),
  places: z.array(tripPlaceSchema).max(MCP_LIMITS.stops),
  days: z.array(tripDaySchema).max(MCP_LIMITS.days),
  transport_legs: z.array(transportLegSchema).max(MCP_LIMITS.legs),
  restaurants: z.array(restaurantSchema).max(MCP_LIMITS.restaurants),
  hotels: z.array(hotelSchema).max(MCP_LIMITS.hotels),
  events: z.array(z.never()).max(0),
  suggestion_places: z.array(placeSchema).max(MCP_LIMITS.suggestionPlaces),
})
export type McpTripBundle = z.infer<typeof mcpTripBundleSchema>

export const truncationSchema = z.object({
  days: z.boolean(),
  stops: z.boolean(),
  legs: z.boolean(),
  restaurants: z.boolean(),
  restaurant_text: z.boolean(),
  hotels: z.boolean(),
  inspiration: z.boolean(),
  suggestion_places: z.boolean(),
  quotes: z.boolean(),
})
export type Truncation = z.infer<typeof truncationSchema>

/** POST /internal/mcp/v1/trips/itinerary response. */
export const itineraryResponseSchema = z.object({
  bundle: mcpTripBundleSchema,
  truncated: truncationSchema,
  /** Every day number the SAVED trip has, even ones this bounded view dropped. */
  /** Inclusive max span: backend/api/schemas.py allows a 366-day difference → 367 days. */
  saved_day_numbers: z.array(z.number().int()).max(367),
})
export type ItineraryResponse = z.infer<typeof itineraryResponseSchema>

/** POST /internal/mcp/v1/trips/list response. */
export const tripSummarySchema = z.object({
  trip_id: uuid,
  title: z.string().nullable(),
  destination: z.string().nullable(),
  status: tripStatus,
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  day_count: z.number().int().nonnegative(),
  created_at: isoInstant,
})
export const tripsPageSchema = z.object({
  trips: z.array(tripSummarySchema).max(MCP_LIMITS.listMax),
  next_cursor: cursor.nullable(),
})
export type TripsPage = z.infer<typeof tripsPageSchema>

/** POST /internal/mcp/v1/saved-reels/list response. */
export const savedReelSchema = z.object({
  reel_id: uuid,
  platform: z.enum(['instagram', 'tiktok', 'manual']),
  kind: z.enum(['reel', 'post', 'other']),
  shortcode: z.string().max(64).nullable(),
  status: z.enum(['not_analyzed', 'queued', 'processing', 'organized', 'location_not_found', 'failed']),
  saved_at: isoInstant,
  place_count: z.number().int().nonnegative(),
  places: z.array(z.object({ name: z.string(), country_name: z.string().nullable() })).max(MCP_LIMITS.reelPlaces),
})
export const savedReelsPageSchema = z.object({
  reels: z.array(savedReelSchema).max(MCP_LIMITS.listMax),
  next_cursor: cursor.nullable(),
})
export type SavedReelsPage = z.infer<typeof savedReelsPageSchema>

// ---- Backend request bodies (the delegation body hash covers these exact bytes) ----

export const listRequestSchema = z.object({
  limit: z.number().int().min(1).max(MCP_LIMITS.listMax),
  cursor: cursor.optional(),
}).strict()
export const itineraryRequestSchema = z.object({
  trip_id: uuid,
  day: z.number().int().min(1).max(MCP_LIMITS.maxDay).optional(),
}).strict()

// ---- Tool I/O (model-visible) ----

export const listToolInput = {
  limit: z.number().int().min(1).max(MCP_LIMITS.listMax).optional()
    .describe(`How many to return (1-${MCP_LIMITS.listMax}, default ${MCP_LIMITS.listDefault}).`),
  cursor: cursor.optional().describe('next_cursor from the previous page, to continue listing.'),
}
export const itineraryToolInput = {
  trip_id: uuid.describe('The full trip_id from list_trips.'),
  day: z.number().int().min(1).max(MCP_LIMITS.maxDay).optional().describe('Only this day number.'),
}
export const renderToolInput = {
  trip_id: uuid.describe('The full trip_id from list_trips.'),
  focus_day: z.number().int().min(1).max(MCP_LIMITS.maxDay).optional()
    .describe('Open the card on this day number.'),
}

export const profileOutput = {
  id: z.string().min(1).regex(/\S/),
  name: z.string().optional(),
  email: z.string().optional(),
}

export const itinerarySummarySchema = z.object({
  trip: z.object({
    trip_id: uuid,
    title: z.string().nullable(),
    destination: z.string().nullable(),
    status: tripStatus,
    start_date: isoDate.nullable(),
    end_date: isoDate.nullable(),
    summary: z.string().nullable(),
  }),
  days: z.array(z.object({
    day_number: z.number().int(),
    date: isoDate.nullable(),
    title: z.string().nullable(),
    summary: z.string().nullable(),
    weather_summary: z.string().nullable(),
    stops: z.array(z.object({
      trip_place_id: uuid,
      name: z.string(),
      place_type: placeType,
      city: z.string().nullable(),
      source_type: z.enum(['reel_extracted', 'user_requested', 'agent_suggested']),
      evidence: z.object({ kind: evidenceKind, quote: z.string().nullable(), source_url: z.string().nullable() }),
    })),
    legs: z.array(z.object({
      mode: z.enum(['walk', 'drive', 'cycle', 'transit_hint', 'unknown']),
      duration_s: z.number().nullable(),
      warning: z.string().nullable(),
    })),
  })),
  unscheduled_stops: z.array(z.object({ trip_place_id: uuid, name: z.string() })),
  restaurants: z.array(z.object({
    name: z.string(),
    day_number: z.number().int().nullable(),
    cuisine: z.string().nullable(),
    summary: z.string(),
  })),
  hotels: z.array(z.object({
    name: z.string(),
    area: z.string().nullable(),
    status: z.enum(['suggested', 'unavailable', 'skipped', 'failed']),
    is_recommended: z.boolean(),
    star_rating: z.number().nullable(),
    guest_rating: z.number().nullable(),
    price_label: z.string().nullable(),
    refundable: z.boolean().nullable(),
    free_cancellation_until: z.string().nullable(),
  })),
  truncated: truncationSchema,
  days_shown: z.array(z.number().int()),
  saved_day_numbers: z.array(z.number().int()),
})
export type ItinerarySummary = z.infer<typeof itinerarySummarySchema>

export const renderSummarySchema = itinerarySummarySchema.extend({ focus_day: z.number().int().nullable() })

/** `_meta` key carrying the widget-only bundle on render_itinerary results (hidden from the model). */
export const BUNDLE_META_KEY = 'astrail/bundle'

/** `_meta` key carrying the widget's links on render_itinerary results (hidden from the model). */
export const LINKS_META_KEY = 'astrail/links'
const httpUrl = z.string().url().max(4096).regex(/^https?:\/\//)
/**
 * Optional, and validated apart from the bundle: a bad links block drops the links, never the card.
 * `trip_url` opens the trip in Astrail; `day_maps` maps a day NUMBER to a signed static route-map
 * URL on our own origin (lib/mcp/static-map.ts), present only for days with located stops.
 */
export const widgetLinksSchema = z.object({
  trip_url: httpUrl,
  day_maps: z.record(z.string().regex(/^\d{1,3}$/), httpUrl).optional(),
})
export type WidgetLinks = z.infer<typeof widgetLinksSchema>
export const ITINERARY_RESOURCE_URI = 'ui://astrail/itinerary-v3.html'
/** The Trip Library (sidebar + conversation panel) UI. Versioned like the itinerary: hosts cache by URI. */
export const LIBRARY_RESOURCE_URI = 'ui://astrail/library-v2.html'
/** Still registered so hosts that cached v1 keep working (old CSP: the map is blocked, the UI falls back). */
export const LIBRARY_V1_RESOURCE_URI = 'ui://astrail/library-v1.html'
/** Hidden `_meta` key carrying the public Mapbox token on the library entrypoint results. */
export const MAPBOX_TOKEN_META_KEY = 'astrail/mapbox_token'

// ---- Compile-time proof that the bundle is a real TripBundle (N2) ----

type Assignable<A, B> = A extends B ? true : false
type Expect<T extends true> = T
export type _Assignable = [
  Expect<Assignable<z.infer<typeof placeSchema>, Place>>,
  Expect<Assignable<z.infer<typeof tripSchema>, Trip>>,
  Expect<Assignable<z.infer<typeof inspirationSchema>, TripInspirationItem>>,
  Expect<Assignable<z.infer<typeof tripPlaceSchema>, TripPlace>>,
  Expect<Assignable<z.infer<typeof tripDaySchema>, TripDay>>,
  Expect<Assignable<z.infer<typeof transportLegSchema>, TransportLeg>>,
  Expect<Assignable<z.infer<typeof restaurantSchema>, RestaurantSuggestion>>,
  Expect<Assignable<z.infer<typeof hotelSchema>, HotelSuggestion>>,
  Expect<Assignable<McpTripBundle, TripBundle>>,
]
