/**
 * A realistic `trips/itinerary` response (lib/mcp/contract.ts `ItineraryResponse`) covering every
 * shape the widget has to render honestly:
 *   - stops from a Reel, a user request that carries Reel evidence, and an Astrail pick;
 *   - an unscheduled stop (day_number null);
 *   - a day with legs but no stops (StopTimeline's leg connectors), weather from open_meteo and from 'manual';
 *   - a suggestion-only restaurant (named via suggestion_places) and one with no place at all;
 *   - placed+ranked, placed+unranked and unresolved hotels.
 * Every value is one the MCP projection can really send (documented defaults included), and the
 * tests assert that each export validates against `itineraryResponseSchema`. The gateway tests
 * import these too.
 */
import type { ItineraryResponse, McpTripBundle, Truncation } from '@/lib/mcp/contract'

/** RFC 4122 v4-shaped ids that stay readable in a failing assertion. */
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

export const FIXTURE_IDS = {
  user: id(1),
  trip: id(2),
  otherTrip: id(3),
  day1: id(11), day2: id(12), day3: id(13),
  placeSensoji: id(21), placeNakamise: id(22), placeKappabashi: id(23),
  placeTeamlab: id(24), placeTsukiji: id(25), placeShibuyaSky: id(26), placeImahan: id(27),
  tpSensoji: id(31), tpNakamise: id(32), tpKappabashi: id(33),
  tpTeamlab: id(34), tpTsukiji: id(35), tpShibuyaSky: id(36),
  leg1: id(41), leg2: id(42), leg3: id(43), leg4: id(44),
  restImahan: id(51), restNoPlace: id(52),
  hotelGracery: id(61), hotelMimaru: id(62), hotelUnplaced: id(63),
} as const

const I = FIXTURE_IDS

export const REEL_ASAKUSA = 'https://www.instagram.com/reel/DAsakusa01'
export const REEL_TEAMLAB = 'https://www.instagram.com/reel/DTeamlab02'
export const COVER_ASAKUSA = 'https://scontent.cdninstagram.com/v/t51.2885-15/asakusa-cover.jpg'
export const COVER_TEAMLAB = 'https://scontent.cdninstagram.com/v/t51.2885-15/teamlab-cover.jpg'

const NO_TRUNCATION: Truncation = {
  days: false, stops: false, legs: false, restaurants: false, restaurant_text: false,
  hotels: false, inspiration: false, suggestion_places: false, quotes: false,
}

function place(pid: string, name: string, extra: Partial<McpTripBundle['suggestion_places'][number]> = {}) {
  return {
    id: pid, name, name_local: null, place_type: 'attraction' as const,
    lat: 35.7, lng: 139.79, country: 'Japan', city: 'Tokyo', area: null,
    aliases: [], source_summary: {}, ...extra,
  }
}

const bundle: McpTripBundle = {
  trip: {
    id: I.trip,
    user_id: I.user,
    status: 'complete',
    destination_hint: 'Tokyo',
    inferred_destination: 'Tokyo, Japan',
    start_date: '2026-10-12',
    end_date: '2026-10-14',
    origin_city: 'Singapore',
    budget_level: 'mid_range',
    adult_count: 2,
    child_count: 0,
    room_count: 1,
    preference_sources: ['explicit', 'memory'],
    preference_summary: 'Slow mornings, street food, one big view.',
    title: 'Tokyo in three Reels',
    summary: 'Old Asakusa, digital art and the outer market, with a hotel near the river.',
    tradeoffs: { notes: [], comparisons: [] },
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:04:00Z',
  },
  inspiration: [
    {
      id: 'insp-1', trip_id: I.trip, item_type: 'reel_url', source: 'manual_paste',
      normalized_reel_url: REEL_ASAKUSA, reel_cache_id: 'rc_asakusa', requested_place_text: null,
      resolved_place_id: null, status: 'places_found', thumbnail_url: COVER_ASAKUSA,
    },
    {
      id: 'insp-2', trip_id: I.trip, item_type: 'reel_url', source: 'web_share_target',
      normalized_reel_url: REEL_TEAMLAB, reel_cache_id: 'rc_teamlab', requested_place_text: null,
      resolved_place_id: null, status: 'places_found', thumbnail_url: COVER_TEAMLAB,
    },
    {
      id: 'insp-3', trip_id: I.trip, item_type: 'requested_place', source: 'manual_input',
      normalized_reel_url: null, reel_cache_id: null, requested_place_text: 'Shibuya Sky',
      resolved_place_id: I.placeShibuyaSky, status: 'resolved', thumbnail_url: null,
    },
  ],
  places: [
    {
      id: I.tpSensoji, trip_id: I.trip, place_id: I.placeSensoji, source_type: 'reel_extracted',
      evidence_json: {
        confidence: 0.92, source_url: null, source_reel_url: `${REEL_ASAKUSA}/`,
        quote: 'the lanterns at Sensō-ji before 7am are unreal', quotes: ['the lanterns at Sensō-ji before 7am are unreal'],
        rationale: null, evidence_kind: 'reel_quote',
      },
      day_number: 1, sort_order: 1,
      place: place(I.placeSensoji, 'Sensō-ji', { name_local: '浅草寺', area: 'Asakusa' }),
    },
    {
      // A stop the traveller asked for that ALSO appeared in a Reel: thumbnailFor still gives no
      // cover, because provenance is gated on source_type (popup-model.ts reelUrlFor).
      id: I.tpNakamise, trip_id: I.trip, place_id: I.placeNakamise, source_type: 'user_requested',
      evidence_json: {
        confidence: 0.88, source_url: REEL_ASAKUSA, source_reel_url: REEL_ASAKUSA,
        quote: 'grab ningyo-yaki on Nakamise on the way in', quotes: [],
        rationale: null, evidence_kind: 'reel_quote',
      },
      day_number: 1, sort_order: 2,
      place: place(I.placeNakamise, 'Nakamise-dori', { place_type: 'shop', area: 'Asakusa' }),
    },
    {
      id: I.tpKappabashi, trip_id: I.trip, place_id: I.placeKappabashi, source_type: 'agent_suggested',
      evidence_json: {
        confidence: 0.7, source_url: 'https://www.kappabashi.or.jp/en/', quote: null, quotes: [],
        rationale: 'A short walk west, and it fits the street-food theme.', evidence_kind: 'suggested_by_astrail',
      },
      day_number: 1, sort_order: 3,
      place: place(I.placeKappabashi, 'Kappabashi Kitchen Street', { place_type: 'shop', area: 'Taito' }),
    },
    {
      id: I.tpTeamlab, trip_id: I.trip, place_id: I.placeTeamlab, source_type: 'reel_extracted',
      evidence_json: {
        confidence: 0.95, source_url: null, source_reel_url: REEL_TEAMLAB,
        quote: 'wading through the water room at teamLab', quotes: [],
        rationale: null, evidence_kind: 'reel_quote',
      },
      day_number: 2, sort_order: 1,
      place: place(I.placeTeamlab, 'teamLab Planets', { area: 'Toyosu' }),
    },
    {
      id: I.tpTsukiji, trip_id: I.trip, place_id: I.placeTsukiji, source_type: 'agent_suggested',
      evidence_json: {
        confidence: 0.66, source_url: 'https://www.tsukiji.or.jp/english/', quote: null, quotes: [],
        rationale: 'Breakfast stalls close by early afternoon.', evidence_kind: 'research',
      },
      day_number: 2, sort_order: 2,
      place: place(I.placeTsukiji, 'Tsukiji Outer Market', { place_type: 'area', area: 'Chuo' }),
    },
    {
      id: I.tpShibuyaSky, trip_id: I.trip, place_id: I.placeShibuyaSky, source_type: 'user_requested',
      evidence_json: {
        confidence: 1, source_url: null, quote: 'Shibuya Sky', quotes: ['Shibuya Sky'],
        rationale: null, evidence_kind: 'requested_by_you',
      },
      day_number: null, sort_order: null,
      place: place(I.placeShibuyaSky, 'Shibuya Sky', { area: 'Shibuya' }),
    },
  ],
  days: [
    {
      id: I.day1, trip_id: I.trip, day_number: 1, day_date: '2026-10-12',
      title: 'Lanterns and kitchenware', summary: 'An early temple, snacks on the approach, then knives.',
      weather_summary: 'Clear, 16–23°C', weather_source: 'open_meteo', weather_payload: {},
    },
    {
      id: I.day2, trip_id: I.trip, day_number: 2, day_date: '2026-10-13',
      title: 'Water and light', summary: 'Book the first teamLab slot, then breakfast at the market.',
      weather_summary: 'Showers likely', weather_source: 'manual', weather_payload: {},
    },
    {
      id: I.day3, trip_id: I.trip, day_number: 3, day_date: '2026-10-14',
      title: 'Departure', summary: null, weather_summary: null, weather_source: null, weather_payload: {},
    },
  ],
  transport_legs: [
    {
      id: I.leg1, trip_id: I.trip, trip_day_id: I.day1, from_place_id: I.placeSensoji,
      to_place_id: I.placeNakamise, leg_order: 1, transport_mode: 'walk', routing_provider: 'mapbox',
      routing_profile: 'walking', status: 'ok', duration_seconds: 240, distance_meters: 300,
      route_geometry: null, warning: null,
    },
    {
      id: I.leg2, trip_id: I.trip, trip_day_id: I.day1, from_place_id: I.placeNakamise,
      to_place_id: I.placeKappabashi, leg_order: 2, transport_mode: 'walk', routing_provider: 'mapbox',
      routing_profile: 'walking', status: 'ok', duration_seconds: 900, distance_meters: 1100,
      route_geometry: null, warning: null,
    },
    {
      id: I.leg3, trip_id: I.trip, trip_day_id: I.day2, from_place_id: I.placeTeamlab,
      to_place_id: I.placeTsukiji, leg_order: 1, transport_mode: 'drive', routing_provider: 'mapbox',
      routing_profile: 'driving', status: 'ok', duration_seconds: 1080, distance_meters: 5200,
      route_geometry: null, warning: null,
    },
    {
      id: I.leg4, trip_id: I.trip, trip_day_id: I.day3, from_place_id: I.placeTsukiji,
      to_place_id: null, leg_order: 1, transport_mode: 'transit_hint', routing_provider: 'none',
      routing_profile: null, status: 'no_route', duration_seconds: null, distance_meters: null,
      route_geometry: null, warning: 'Allow about 45 minutes to Haneda by train.',
    },
  ],
  restaurants: [
    {
      id: I.restImahan, trip_id: I.trip, trip_day_id: I.day1, restaurant_place_id: I.placeImahan,
      near_place_id: I.placeSensoji, cuisine: 'Sukiyaki', summary: 'A century-old sukiyaki room near the temple.',
      source_url: 'https://www.asakusaimahan.co.jp/', evidence_json: {}, preference_match_json: {},
    },
    {
      id: I.restNoPlace, trip_id: I.trip, trip_day_id: I.day2, restaurant_place_id: null,
      near_place_id: I.placeTsukiji, cuisine: 'Sushi', summary: 'Counter sushi inside the outer market.',
      source_url: null, evidence_json: {}, preference_match_json: {},
    },
  ],
  hotels: [
    {
      id: I.hotelGracery, trip_id: I.trip, trip_day_id: null, base_place_id: null,
      name: 'Asakusa Riverside Hotel', area: 'Asakusa', star_rating: 4,
      price_snapshot: { currency: 'SGD', pricePerNight: 214, totalPrice: 428 },
      travala_hotel_id: 'tv-1001', guest_rating: 8.7, refundable: true,
      free_cancellation_until: '2026-10-05T15:00:00Z', preference_match_json: {}, source: 'travala',
      status: 'suggested', searched_at: '2026-09-20T08:03:00Z', lat: 35.711, lng: 139.797,
      geo_status: 'placed', route_score: 0.91, rank: 1, is_recommended: true, place_durations: {},
    },
    {
      id: I.hotelUnplaced, trip_id: I.trip, trip_day_id: null, base_place_id: null,
      name: 'Kuramae Loft Stay', area: 'Kuramae', star_rating: null,
      price_snapshot: { currency: 'SGD', totalPrice: 380 },
      travala_hotel_id: 'tv-1003', guest_rating: null, refundable: null,
      free_cancellation_until: null, preference_match_json: {}, source: 'travala',
      status: 'suggested', searched_at: '2026-09-20T08:03:00Z', lat: null, lng: null,
      geo_status: 'unresolved', route_score: null, rank: null, is_recommended: false, place_durations: {},
    },
    {
      id: I.hotelMimaru, trip_id: I.trip, trip_day_id: null, base_place_id: null,
      name: 'Ueno Park Suites', area: 'Ueno', star_rating: 3,
      price_snapshot: { currency: 'SGD', pricePerNight: 165 },
      travala_hotel_id: 'tv-1002', guest_rating: 8.1, refundable: false,
      free_cancellation_until: null, preference_match_json: {}, source: 'travala',
      status: 'suggested', searched_at: '2026-09-20T08:03:00Z', lat: 35.713, lng: 139.776,
      geo_status: 'placed', route_score: null, rank: null, is_recommended: false, place_durations: {},
    },
  ],
  events: [],
  suggestion_places: [
    place(I.placeImahan, 'Asakusa Imahan', { place_type: 'restaurant', area: 'Asakusa' }),
  ],
}

export const MULTI_SOURCE_RESPONSE: ItineraryResponse = {
  bundle,
  truncated: NO_TRUNCATION,
  saved_day_numbers: [1, 2, 3],
}

/** Keep only the given days, with their stops, legs and restaurants (and the places those
    restaurants reference) — the same referential rule as the backend's terminal day-drop. */
function withDays(source: McpTripBundle, keep: number[]): McpTripBundle {
  const days = source.days.filter((d) => keep.includes(d.day_number))
  const dayIds = new Set(days.map((d) => d.id))
  const restaurants = source.restaurants.filter((r) => r.trip_day_id !== null && dayIds.has(r.trip_day_id))
  const referenced = new Set(restaurants.flatMap((r) => [r.restaurant_place_id, r.near_place_id]))
  return {
    ...source,
    days,
    places: source.places.filter((tp) => tp.day_number === null || keep.includes(tp.day_number)),
    transport_legs: source.transport_legs.filter((l) => l.trip_day_id !== null && dayIds.has(l.trip_day_id)),
    restaurants,
    suggestion_places: source.suggestion_places.filter((p) => referenced.has(p.id)),
  }
}

/** The byte budget dropped Day 3: the banner reads "2 of 3 days". */
export const TRUNCATED_RESPONSE: ItineraryResponse = {
  bundle: withDays(bundle, [1, 2]),
  truncated: { ...NO_TRUNCATION, days: true },
  saved_day_numbers: [1, 2, 3],
}

/** A trip whose first day is Day 2 — the selected day must be a number, never index 0. */
export const DAY_TWO_START_RESPONSE: ItineraryResponse = {
  bundle: withDays(bundle, [2, 3]),
  truncated: NO_TRUNCATION,
  saved_day_numbers: [2, 3],
}

/** A trip saved before any day was planned: only the unscheduled stop and the hotels remain. */
export const NO_DAYS_RESPONSE: ItineraryResponse = {
  bundle: withDays(bundle, []),
  truncated: NO_TRUNCATION,
  saved_day_numbers: [],
}

/** A different trip, for the "restored state belongs to another trip" rule. */
export const OTHER_TRIP_RESPONSE: ItineraryResponse = {
  ...MULTI_SOURCE_RESPONSE,
  bundle: { ...bundle, trip: { ...bundle.trip, id: I.otherTrip, title: 'Another trip', inferred_destination: 'Osaka, Japan' } },
}

// ---- Bounded-view and layout cases (Codex round 4: F2, F3, F5) ----

/** The byte budget dropped every inspiration row: Reel stops remain, their covers do not. */
export const CAPPED_INSPIRATION_RESPONSE: ItineraryResponse = {
  bundle: { ...bundle, inspiration: [] },
  truncated: { ...NO_TRUNCATION, inspiration: true },
  saved_day_numbers: [1, 2, 3],
}

/** The same bundle with no inspiration and NO truncation: a trip that genuinely has no Reel rows. */
export const NO_REELS_COMPLETE_RESPONSE: ItineraryResponse = {
  ...CAPPED_INSPIRATION_RESPONSE,
  truncated: NO_TRUNCATION,
}

/** A saved-with-gaps trip whose Reel stops lost their quotes to the budget (quotes → [], then the
    primary quote → null), exactly as backend mcp_budget.py reduces them. */
const quotesCut: McpTripBundle = {
  ...bundle,
  trip: { ...bundle.trip, status: 'saved_with_gaps' },
  places: bundle.places.map((tp) => (tp.source_type === 'reel_extracted'
    ? { ...tp, evidence_json: { ...tp.evidence_json, quote: null, quotes: [] } }
    : tp)),
}
export const CAPPED_QUOTES_RESPONSE: ItineraryResponse = {
  bundle: quotesCut,
  truncated: { ...NO_TRUNCATION, quotes: true },
  saved_day_numbers: [1, 2, 3],
}
/** Control: the same quote-less stops in a COMPLETE result — there the absence is real. */
export const NO_QUOTES_COMPLETE_RESPONSE: ItineraryResponse = {
  ...CAPPED_QUOTES_RESPONSE,
  truncated: NO_TRUNCATION,
}

const LONG = 'Sukiyakiimahanasakusakaminarimonriversidegrandhotelandresidences'
/** Unbroken long strings wherever the card prints free text: nothing may widen the page. */
export const LONG_TEXT_RESPONSE: ItineraryResponse = {
  ...MULTI_SOURCE_RESPONSE,
  bundle: {
    ...bundle,
    trip: { ...bundle.trip, inferred_destination: `${LONG}, Japan`, origin_city: LONG },
    days: bundle.days.map((d) => (d.day_number === 1
      ? { ...d, title: `${LONG} day`, summary: `${LONG}${LONG}`, weather_summary: LONG }
      : d)),
    places: bundle.places.map((tp) => (tp.id === I.tpSensoji || tp.id === I.tpShibuyaSky
      ? { ...tp, place: { ...tp.place, name: `${tp.place.name} ${LONG}${LONG}`, area: LONG } }
      : tp)),
    restaurants: bundle.restaurants.map((r) => ({ ...r, cuisine: `${LONG}${LONG}`, summary: `${LONG}${LONG}` })),
    suggestion_places: bundle.suggestion_places.map((p) => ({ ...p, name: `${LONG}${LONG}` })),
    hotels: bundle.hotels.map((h) => ({ ...h, name: `${h.name} ${LONG}${LONG}`, area: LONG })),
  },
}

/** Twelve days, so the date strip overflows at phone width and Day 12 starts offscreen. */
const extraDays = Array.from({ length: 9 }, (_, i) => {
  const n = i + 4
  return {
    id: id(200 + n), trip_id: I.trip, day_number: n, day_date: `2026-10-${String(11 + n).padStart(2, '0')}`,
    title: `Day ${n} in Tokyo`, summary: null, weather_summary: null, weather_source: null, weather_payload: {},
  }
})
export const TWELVE_DAY_RESPONSE: ItineraryResponse = {
  bundle: {
    ...bundle,
    trip: { ...bundle.trip, end_date: '2026-10-23' },
    days: [...bundle.days, ...extraDays],
  },
  truncated: NO_TRUNCATION,
  saved_day_numbers: Array.from({ length: 12 }, (_, i) => i + 1),
}
