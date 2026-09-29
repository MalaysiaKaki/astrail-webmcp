"""Remote-MCP read contract — mirrors frontend/lib/mcp/contract.ts field for field (guardrail #4).

The Next.js gateway validates every response from /internal/mcp/v1/* against the zod schemas
in contract.ts, so a drift here surfaces as `upstream_unavailable` in ChatGPT, not as a 500.
Change both files together.

Request models forbid extra keys and use strict scalars: the gateway's delegation body hash
covers the exact bytes it sent, and zod rejects what these reject (a string "5", an explicit
null for an optional key). The UUID pattern is zod 4's RFC 9562 form, not "any hex".
"""
from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator,
)

# ---- Limits: mirror of MCP_LIMITS in frontend/lib/mcp/contract.ts. Change both together. ----
MCP_LIST_DEFAULT = 20
MCP_LIST_MAX = 50
MCP_CURSOR_MAX_CHARS = 128
MCP_MAX_DAY = 30
MCP_MAX_DAYS = 30
MCP_MAX_STOPS = 200
MCP_MAX_LEGS = 300
MCP_MAX_RESTAURANTS = 60
MCP_MAX_SUGGESTION_PLACES = 120
MCP_MAX_HOTELS = 10
MCP_MAX_INSPIRATION = 60
MCP_MAX_REEL_PLACES = 10
MCP_NAME_CHARS = 120
MCP_TEXT_CHARS = 280
MCP_WARNING_CHARS = 160
MCP_TITLE_CHARS = 160
MCP_URL_CHARS = 512
MCP_BUNDLE_BYTES = 256 * 1024
# contract.ts `saved_day_numbers: z.array(...).max(367)`: api/schemas.py allows a 366-day
# end - start difference and both dates are inclusive, so a saved trip can have 367 days.
MCP_MAX_SAVED_DAY_NUMBERS = 367

# zod 4 `z.string().uuid()`: RFC 9562 version nibble 1-8 and variant 8/9/a/b, plus nil/max.
UUID_PATTERN = (
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
)
CURSOR_PATTERN = r"^[A-Za-z0-9_-]+$"

Uuid = Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
IsoInstant = Annotated[str, StringConstraints(min_length=1, max_length=64)]
Cursor = Annotated[
    str, StringConstraints(min_length=1, max_length=MCP_CURSOR_MAX_CHARS, pattern=CURSOR_PATTERN)
]
EmptyRecord = Annotated[dict[str, Any], Field(max_length=0)]
EmptyList = Annotated[list[Any], Field(max_length=0)]

TripStatus = Literal["draft", "generating", "places_ready", "complete", "saved_with_gaps", "failed"]
PlaceType = Literal[
    "attraction", "restaurant", "hotel", "area", "city", "country", "station", "shop", "other",
]
EvidenceKind = Literal[
    "reel_quote", "requested_by_you", "research", "mapbox_route", "open_meteo",
    "travala_hotel_search", "memory_preference", "inferred_default", "suggested_by_astrail",
]
PlaceSourceType = Literal["reel_extracted", "user_requested", "agent_suggested"]
TransportMode = Literal["walk", "drive", "cycle", "transit_hint", "unknown"]
HotelStatus = Literal["suggested", "unavailable", "skipped", "failed"]


# ---- Requests (contract.ts listRequestSchema / itineraryRequestSchema, both .strict()) ----

class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    @field_validator("*", mode="before")
    @classmethod
    def _no_explicit_null(cls, value: Any) -> Any:
        # zod `.optional()` accepts an ABSENT key, not `null`. Defaults are not validated, so
        # this only fires when the caller sent null explicitly.
        if value is None:
            raise ValueError("must be omitted, not null")
        return value


class McpListRequest(_StrictRequest):
    limit: Annotated[int, Field(ge=1, le=MCP_LIST_MAX)]
    cursor: Cursor | None = None


class McpItineraryRequest(_StrictRequest):
    trip_id: Uuid
    day: Annotated[int, Field(ge=1, le=MCP_MAX_DAY)] | None = None


# ---- Bundle rows (each mirrors a contract.ts row schema, itself a backend-types.ts row) ----

class McpPlace(BaseModel):
    id: Uuid
    name: str
    name_local: str | None
    place_type: PlaceType
    lat: float
    lng: float
    country: str | None
    city: str | None
    area: str | None
    aliases: list[str]
    source_summary: EmptyRecord


class McpTradeoffs(BaseModel):
    notes: EmptyList
    comparisons: EmptyList


class McpTrip(BaseModel):
    id: Uuid
    user_id: Uuid
    status: TripStatus
    destination_hint: str | None
    inferred_destination: str | None
    start_date: IsoDate | None
    end_date: IsoDate | None
    origin_city: str | None
    budget_level: Literal["budget", "mid_range", "premium", "luxury"] | None
    adult_count: int
    child_count: int
    room_count: int
    preference_sources: list[Literal["explicit", "memory", "inferred_default"]]
    preference_summary: str | None
    title: str | None
    summary: str | None
    tradeoffs: McpTradeoffs
    created_at: IsoInstant
    updated_at: IsoInstant


class McpInspiration(BaseModel):
    id: str
    trip_id: Uuid
    item_type: Literal["reel_url", "requested_place"]
    source: Literal["manual_paste", "clipboard", "web_share_target", "manual_input"]
    normalized_reel_url: str | None
    reel_cache_id: str | None
    requested_place_text: str | None
    resolved_place_id: str | None
    status: Literal[
        "valid", "invalid", "duplicate", "queued", "cached", "processing", "places_found",
        "needs_review", "failed", "pending_resolution", "resolved", "ambiguous", "unresolved",
    ]
    thumbnail_url: str | None


class McpEvidence(BaseModel):
    confidence: float
    source_url: str | None
    source_reel_url: str | None = None
    quote: str | None
    quotes: list[str]
    rationale: str | None
    evidence_kind: EvidenceKind


class McpTripPlace(BaseModel):
    id: Uuid
    trip_id: Uuid
    place_id: Uuid
    source_type: PlaceSourceType
    evidence_json: McpEvidence
    day_number: int | None
    sort_order: int | None
    place: McpPlace


class McpTripDay(BaseModel):
    id: Uuid
    trip_id: Uuid
    day_number: int
    day_date: IsoDate | None
    title: str | None
    summary: str | None
    weather_summary: str | None
    weather_source: Literal["open_meteo", "manual", "none"] | None
    weather_payload: EmptyRecord


class McpTransportLeg(BaseModel):
    id: Uuid
    trip_id: Uuid
    trip_day_id: Uuid | None
    from_place_id: Uuid | None
    to_place_id: Uuid | None
    leg_order: int
    transport_mode: TransportMode
    routing_provider: Literal["mapbox", "manual", "none"]
    routing_profile: Literal["walking", "driving", "driving-traffic", "cycling"] | None
    status: Literal["pending", "ok", "no_route", "failed", "skipped"]
    duration_seconds: float | None
    distance_meters: float | None
    route_geometry: None
    warning: str | None


class McpRestaurant(BaseModel):
    id: Uuid
    trip_id: Uuid
    trip_day_id: Uuid | None
    restaurant_place_id: Uuid | None
    near_place_id: Uuid | None
    cuisine: str | None
    summary: str
    source_url: str | None
    evidence_json: EmptyRecord
    preference_match_json: EmptyRecord


PRICE_SNAPSHOT_KEYS = {"currency": str, "pricePerNight": float, "totalPrice": float}


def _check_price_snapshot(value: dict[str, Any]) -> dict[str, Any]:
    # contract.ts: `.strict()` object whose three keys are OPTIONAL, not nullable — an absent
    # value must be an absent key, which a model with `None` defaults would serialize as null.
    for key, item in value.items():
        expected = PRICE_SNAPSHOT_KEYS.get(key)
        if expected is None:
            raise ValueError(f"unexpected price_snapshot key {key!r}")
        if expected is str and not isinstance(item, str):
            raise ValueError(f"price_snapshot.{key} must be a string")
        if expected is float and (isinstance(item, bool) or not isinstance(item, (int, float))):
            raise ValueError(f"price_snapshot.{key} must be a number")
    return value


class McpHotel(BaseModel):
    id: Uuid
    trip_id: Uuid
    trip_day_id: Uuid | None
    base_place_id: Uuid | None
    name: str
    area: str | None
    star_rating: float | None
    price_snapshot: Annotated[dict[str, Any], AfterValidator(_check_price_snapshot)]
    travala_hotel_id: str | None
    guest_rating: float | None
    refundable: bool | None
    free_cancellation_until: str | None
    preference_match_json: EmptyRecord
    source: Literal["travala", "manual", "agent"]
    status: HotelStatus
    searched_at: str | None
    lat: float | None
    lng: float | None
    geo_status: Literal["placed", "unresolved"]
    route_score: float | None
    rank: int | None
    is_recommended: bool
    place_durations: Annotated[dict[str, float], Field(max_length=0)]


class McpTripBundle(BaseModel):
    trip: McpTrip
    inspiration: Annotated[list[McpInspiration], Field(max_length=MCP_MAX_INSPIRATION)]
    places: Annotated[list[McpTripPlace], Field(max_length=MCP_MAX_STOPS)]
    days: Annotated[list[McpTripDay], Field(max_length=MCP_MAX_DAYS)]
    transport_legs: Annotated[list[McpTransportLeg], Field(max_length=MCP_MAX_LEGS)]
    restaurants: Annotated[list[McpRestaurant], Field(max_length=MCP_MAX_RESTAURANTS)]
    hotels: Annotated[list[McpHotel], Field(max_length=MCP_MAX_HOTELS)]
    events: EmptyList
    suggestion_places: Annotated[list[McpPlace], Field(max_length=MCP_MAX_SUGGESTION_PLACES)]


class McpTruncation(BaseModel):
    days: bool = False
    stops: bool = False
    legs: bool = False
    restaurants: bool = False
    restaurant_text: bool = False
    hotels: bool = False
    inspiration: bool = False
    suggestion_places: bool = False
    quotes: bool = False


class McpItineraryResponse(BaseModel):
    bundle: McpTripBundle
    truncated: McpTruncation
    # Every day number the SAVED trip has, even ones this bounded view dropped.
    saved_day_numbers: Annotated[list[int], Field(max_length=MCP_MAX_SAVED_DAY_NUMBERS)]


# ---- List pages ----

class McpTripSummary(BaseModel):
    trip_id: Uuid
    title: str | None
    destination: str | None
    status: TripStatus
    start_date: IsoDate | None
    end_date: IsoDate | None
    day_count: Annotated[int, Field(ge=0)]
    created_at: IsoInstant


class McpTripsPage(BaseModel):
    trips: Annotated[list[McpTripSummary], Field(max_length=MCP_LIST_MAX)]
    next_cursor: Cursor | None


class McpReelPlace(BaseModel):
    name: str
    country_name: str | None


class McpSavedReel(BaseModel):
    reel_id: Uuid
    platform: Literal["instagram", "tiktok", "manual"]
    kind: Literal["reel", "post", "other"]
    shortcode: Annotated[str, StringConstraints(max_length=64)] | None
    status: Literal[
        "not_analyzed", "queued", "processing", "organized", "location_not_found", "failed",
    ]
    saved_at: IsoInstant
    place_count: Annotated[int, Field(ge=0)]
    places: Annotated[list[McpReelPlace], Field(max_length=MCP_MAX_REEL_PLACES)]


class McpSavedReelsPage(BaseModel):
    reels: Annotated[list[McpSavedReel], Field(max_length=MCP_LIST_MAX)]
    next_cursor: Cursor | None
