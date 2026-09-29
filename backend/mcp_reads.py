"""Owner-scoped, bounded service-role reads behind /internal/mcp/v1/* (docs/mcp-app/PLAN.md §4.3, §5.2).

The client here is the SERVICE-ROLE client, which bypasses RLS, so every owner check is explicit
and comes FIRST: the trips row is read with `.eq("id", trip_id).eq("user_id", user_id)` and a
missing or foreign trip raises TripNotFound before any child table is touched. Children are then
read by `trip_id` only, each with a semantic ORDER BY applied before its SQL LIMIT (fetching
limit + 1 so SQL-limit truncation is reported, never silent).

Saved-Reel reads go through `saved_reel_cards_for_user` rather than the `saved_reel_cards` view:
the view filters on auth.uid(), which is NULL for service_role, so it returns nothing here (F6).

Covers and reel attribution are optional enrichment (guardrail #3): if the create_trip event or
the cards RPC fails, the itinerary still renders with placeholder covers.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import re
from datetime import datetime

from mcp_budget import BundleTooLarge, fit_to_budget, reconcile
from mcp_projection import (
    derived_inspiration, frontend_reel_key, project_day, project_hotel, project_inspiration,
    project_leg, project_place, project_restaurant, project_saved_reel, project_trip,
    project_trip_place, project_trip_summary, reel_key,
)
from models.mcp import (
    MCP_CURSOR_MAX_CHARS, MCP_MAX_DAYS, MCP_MAX_HOTELS, MCP_MAX_INSPIRATION, MCP_MAX_LEGS,
    MCP_MAX_REEL_PLACES, MCP_MAX_RESTAURANTS, MCP_MAX_SAVED_DAY_NUMBERS, MCP_MAX_STOPS,
    MCP_MAX_SUGGESTION_PLACES, McpItineraryResponse, McpSavedReelsPage, McpTripBundle,
    McpTripsPage,
)

logger = logging.getLogger("astrail.mcp.reads")

CARDS_RPC = "saved_reel_cards_for_user"
# Covers come from the owner's most recent saved Reels; one bounded RPC page. A Reel beyond it
# yields no cover and the pin shows the placeholder — the browser's own degradation.
COVER_CARD_LIMIT = 200
CREATE_TRIP_EVENT_LIMIT = 5
# PostgREST's default max-rows. The day-count read pages at this size so a large page of trips
# is never silently capped by the server.
DAY_COUNT_PAGE_ROWS = 1000

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_MAX_CURSOR_INSTANT_CHARS = 40

_PLACE_COLS = "id,name,name_local,place_type,lat,lng,country,city,area,aliases"
_TRIP_COLS = (
    "id,user_id,status,destination_hint,inferred_destination,start_date,end_date,origin_city,"
    "budget_level,adult_count,child_count,room_count,preference_sources,preference_summary,"
    "title,summary,created_at,updated_at"
)
_TRIP_SUMMARY_COLS = "id,title,destination_hint,inferred_destination,status,start_date,end_date,created_at"
_DAY_COLS = "id,trip_id,day_number,day_date,title,summary,weather_summary,weather_source"
_STOP_COLS = (
    f"id,trip_id,place_id,source_type,evidence_json,day_number,sort_order,place:places({_PLACE_COLS})"
)
_LEG_COLS = (
    "id,trip_id,trip_day_id,from_place_id,to_place_id,leg_order,transport_mode,routing_provider,"
    "routing_profile,status,duration_seconds,distance_meters,warning"
)
_RESTAURANT_COLS = "id,trip_id,trip_day_id,restaurant_place_id,near_place_id,cuisine,summary,source_url"
# travala_result_json is read ONLY to project three facts from it (mcp_projection.project_hotel);
# travala_session_id / travala_package_id are never selected.
_HOTEL_COLS = (
    "id,trip_id,trip_day_id,base_place_id,name,area,star_rating,price_snapshot,travala_hotel_id,"
    "travala_result_json,source,status,searched_at,lat,lng,geo_status,route_score,rank,"
    "is_recommended"
)
_INSPIRATION_COLS = (
    "id,trip_id,item_type,source,normalized_reel_url,reel_cache_id,requested_place_text,"
    "resolved_place_id,status"
)


class TripNotFound(Exception):
    """Missing and foreign trips are the same answer (no existence oracle)."""


class InvalidCursor(Exception):
    """A cursor that does not decode to {c: ISO instant, i: UUID}."""


# ---- Keyset cursor: base64url(JSON {"c": created_at, "i": id}), no padding ----

def _normalize_instant(value: str) -> str:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("cursor instant must carry an offset")
    return parsed.isoformat()


def encode_cursor(created_at: str, row_id: str) -> str:
    payload = json.dumps({"c": _normalize_instant(created_at), "i": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).rstrip(b"=").decode("ascii")


def decode_cursor(cursor: str) -> tuple[str, str]:
    """(created_at ISO, id). Carries no owner, URL or SQL — both parts are re-validated."""
    if not (0 < len(cursor) <= MCP_CURSOR_MAX_CHARS) or not _CURSOR_RE.match(cursor):
        raise InvalidCursor()
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        payload = json.loads(raw.decode("utf-8"))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        raise InvalidCursor() from None
    if not isinstance(payload, dict) or set(payload) != {"c", "i"}:
        raise InvalidCursor()
    instant, row_id = payload["c"], payload["i"]
    if not isinstance(instant, str) or len(instant) > _MAX_CURSOR_INSTANT_CHARS:
        raise InvalidCursor()
    if not isinstance(row_id, str) or not _UUID_RE.match(row_id):
        raise InvalidCursor()
    try:
        return _normalize_instant(instant), row_id.lower()
    except ValueError:
        raise InvalidCursor() from None


def _keyset_filter(created_at: str, row_id: str) -> str:
    """(created_at, id) < (c, i) for a DESC/DESC page. Values are double-quoted: the instant
    contains '.' and ':', which PostgREST's logic-tree grammar reserves."""
    return f'created_at.lt."{created_at}",and(created_at.eq."{created_at}",id.lt."{row_id}")'


# ---- trips/list ----

async def _day_counts(client, trip_ids: list[str]) -> dict[str, int]:
    """Day count per trip in one bounded, paged read (no N+1)."""
    counts = {trip_id: 0 for trip_id in trip_ids}
    if not trip_ids:
        return counts
    max_rows = len(trip_ids) * MCP_MAX_SAVED_DAY_NUMBERS
    start = 0
    while start < max_rows:
        end = min(start + DAY_COUNT_PAGE_ROWS, max_rows) - 1
        resp = await (
            client.table("trip_days").select("trip_id").in_("trip_id", trip_ids)
            .order("trip_id").order("id").range(start, end).execute()
        )
        rows = resp.data or []
        for row in rows:
            counts[row["trip_id"]] = counts.get(row["trip_id"], 0) + 1
        if len(rows) < end - start + 1:
            break
        start = end + 1
    return counts


async def list_trips(client, user_id: str, limit: int, cursor: str | None) -> dict:
    query = client.table("trips").select(_TRIP_SUMMARY_COLS).eq("user_id", user_id)
    if cursor is not None:
        query = query.or_(_keyset_filter(*decode_cursor(cursor)))
    resp = await query.order("created_at", desc=True).order("id", desc=True).limit(limit + 1).execute()
    rows = resp.data or []
    page = rows[:limit]
    counts = await _day_counts(client, [row["id"] for row in page])
    next_cursor = encode_cursor(page[-1]["created_at"], page[-1]["id"]) if len(rows) > limit else None
    result = {
        "trips": [project_trip_summary(row, counts.get(row["id"], 0)) for row in page],
        "next_cursor": next_cursor,
    }
    return McpTripsPage.model_validate(result).model_dump(mode="json")


# ---- saved-reels/list ----

def _cards_params(user_id: str, limit: int, after: tuple[str, str] | None) -> dict:
    return {
        "p_user_id": user_id,
        "p_limit": limit,
        "p_after_created": after[0] if after else None,
        "p_after_id": after[1] if after else None,
    }


async def list_saved_reels(client, user_id: str, limit: int, cursor: str | None) -> dict:
    after = decode_cursor(cursor) if cursor is not None else None
    resp = await client.rpc(CARDS_RPC, _cards_params(user_id, limit + 1, after)).execute()
    rows = resp.data or []
    page = rows[:limit]
    next_cursor = encode_cursor(page[-1]["created_at"], page[-1]["id"]) if len(rows) > limit else None
    result = {
        "reels": [project_saved_reel(card, MCP_MAX_REEL_PLACES) for card in page],
        "next_cursor": next_cursor,
    }
    return McpSavedReelsPage.model_validate(result).model_dump(mode="json")


# ---- trips/itinerary ----

async def _owned_trip(client, user_id: str, trip_id: str) -> dict:
    resp = await (
        client.table("trips").select(_TRIP_COLS)
        .eq("id", trip_id).eq("user_id", user_id).maybe_single().execute()
    )
    row = getattr(resp, "data", None) if resp is not None else None
    if not row:
        raise TripNotFound()
    return row


def _child(client, table: str, cols: str, trip_id: str):
    return client.table(table).select(cols).eq("trip_id", trip_id)


async def _rows(query) -> list[dict]:
    return (await query.execute()).data or []


def _general_queries(client, trip_id: str) -> dict:
    """Every child read is trip-scoped, semantically ordered, and SQL-limited to limit + 1."""
    return {
        "days": _child(client, "trip_days", _DAY_COLS, trip_id)
        .order("day_number").limit(MCP_MAX_DAYS + 1),
        "day_numbers": _child(client, "trip_days", "day_number", trip_id)
        .order("day_number").limit(MCP_MAX_SAVED_DAY_NUMBERS),
        "stops": _child(client, "trip_places", _STOP_COLS, trip_id)
        .order("day_number", nullsfirst=False).order("sort_order").order("id")
        .limit(MCP_MAX_STOPS + 1),
        "legs": _child(client, "transport_legs", _LEG_COLS, trip_id)
        .order("leg_order").order("id").limit(MCP_MAX_LEGS + 1),
        "restaurants": _child(client, "restaurant_suggestions", _RESTAURANT_COLS, trip_id)
        .order("id").limit(MCP_MAX_RESTAURANTS + 1),
        # Rank order is load-bearing: rank 1 is the Recommended hub and must survive the LIMIT.
        "hotels": _child(client, "hotel_suggestions", _HOTEL_COLS, trip_id)
        .order("rank", nullsfirst=False).order("id").limit(MCP_MAX_HOTELS + 1),
        "inspiration": _child(client, "trip_inspiration_items", _INSPIRATION_COLS, trip_id)
        .order("id").limit(MCP_MAX_INSPIRATION + 1),
    }


async def _gather(queries: dict) -> dict[str, list[dict]]:
    results = await asyncio.gather(*(_rows(q) for q in queries.values()))
    return dict(zip(queries.keys(), results))


async def _protected_rows(client, trip_id: str, day: int) -> dict[str, list[dict]]:
    """The requested day's stops, legs and restaurants, read by their OWN filtered, limited
    queries, so the trip-wide caps can never crowd them out. Legs and restaurants belong to the
    day by trip_day_id or by referencing one of its stops."""
    first = await _gather({
        "stops": _child(client, "trip_places", _STOP_COLS, trip_id).eq("day_number", day)
        .order("sort_order").order("id").limit(MCP_MAX_STOPS + 1),
        "day": _child(client, "trip_days", "id", trip_id).eq("day_number", day).limit(1),
    })
    if len(first["stops"]) > MCP_MAX_STOPS:
        raise BundleTooLarge()        # the requested day alone exceeds the stop cap: never fake it
    day_id = first["day"][0]["id"] if first["day"] else None
    place_ids = [s["place_id"] for s in first["stops"]]

    def by(table: str, cols: str, col: str, value, limit: int):
        query = _child(client, table, cols, trip_id)
        query = query.in_(col, value) if isinstance(value, list) else query.eq(col, value)
        order = ("leg_order", "id") if table == "transport_legs" else ("id",)
        for key in order:
            query = query.order(key)
        return query.limit(limit + 1)

    legs, restaurants = {}, {}
    if day_id:
        legs["day"] = by("transport_legs", _LEG_COLS, "trip_day_id", day_id, MCP_MAX_LEGS)
        restaurants["day"] = by("restaurant_suggestions", _RESTAURANT_COLS, "trip_day_id", day_id,
                                MCP_MAX_RESTAURANTS)
    if place_ids:
        for col in ("from_place_id", "to_place_id"):
            legs[col] = by("transport_legs", _LEG_COLS, col, place_ids, MCP_MAX_LEGS)
        for col in ("restaurant_place_id", "near_place_id"):
            restaurants[col] = by("restaurant_suggestions", _RESTAURANT_COLS, col, place_ids,
                                  MCP_MAX_RESTAURANTS)
    leg_rows, restaurant_rows = await _gather(legs), await _gather(restaurants)
    return {
        "stops": first["stops"],
        "legs": _unique_rows(r for rows in leg_rows.values() for r in rows),
        "restaurants": _unique_rows(r for rows in restaurant_rows.values() for r in rows),
    }


def _unique_rows(rows) -> list[dict]:
    return list({row["id"]: row for row in rows}.values())


def _stop_key(row: dict):
    n, order = row.get("day_number"), row.get("sort_order")
    return (n is None, n or 0, order is None, order or 0, row["id"])


_SORT_KEYS = {
    "stops": _stop_key,
    "legs": lambda r: (r["leg_order"], r["id"]),
    "restaurants": lambda r: r["id"],
}
_CAPS = {"stops": MCP_MAX_STOPS, "legs": MCP_MAX_LEGS, "restaurants": MCP_MAX_RESTAURANTS}


def _merge_capped(name: str, protected: list[dict], general: list[dict]) -> tuple[list[dict], bool]:
    """Protected rows first, then the trip-wide window, cut at the cap.

    Truncated exactly when the trip-wide query came back over its cap: that query windows over
    EVERY row (protected ones included), so the table holds more than `cap` rows iff it did —
    and a union over the cap, or protected rows over it, both imply that."""
    cap = _CAPS[name]
    seen = {row["id"] for row in protected}
    combined = protected[:cap] + [row for row in general if row["id"] not in seen]
    truncated = len(general) > cap
    return sorted(combined[:cap], key=_SORT_KEYS[name]), truncated


async def _child_rows(client, trip_id: str, day: int | None) -> tuple[dict, dict]:
    """Capped child rows plus their SQL-limit truncation flags."""
    rows = await _gather(_general_queries(client, trip_id))
    protected = await _protected_rows(client, trip_id, day) if day is not None else {}
    flags = {}
    for name in ("stops", "legs", "restaurants"):
        rows[name], flags[name] = _merge_capped(name, protected.get(name, []), rows[name])
    for name, cap in (("days", MCP_MAX_DAYS), ("hotels", MCP_MAX_HOTELS)):
        flags[name] = len(rows[name]) > cap
        rows[name] = rows[name][:cap]
    return rows, flags


async def _declared_event_reels(client, trip_id: str) -> list[str]:
    """Reel URLs from the trip's create_trip event (supabase-api.ts `reelUrlsFromEvents`)."""
    try:
        rows = await _rows(
            _child(client, "generation_events", "payload", trip_id).eq("stage", "create_trip")
            .order("created_at").order("id").limit(CREATE_TRIP_EVENT_LIMIT)
        )
    except Exception as exc:  # noqa: BLE001 — attribution is optional enrichment
        logger.warning("mcp_itinerary_events_degraded type=%s", type(exc).__name__)
        return []
    urls = []
    for row in rows:
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        raw = payload.get("reel_urls")
        urls.extend(raw if isinstance(raw, list) else [])
    return [key for key in (frontend_reel_key(u) for u in urls) if key]


async def _owner_cards(client, user_id: str) -> list[dict]:
    try:
        resp = await client.rpc(CARDS_RPC, _cards_params(user_id, COVER_CARD_LIMIT, None)).execute()
    except Exception as exc:  # noqa: BLE001 — covers are optional enrichment
        logger.warning("mcp_itinerary_covers_degraded type=%s", type(exc).__name__)
        return []
    return resp.data or []


def _unique(items) -> list:
    return list(dict.fromkeys(items))


async def _reel_context(client, user_id: str, trip_id: str, rows: dict) -> dict:
    """Covers, per-stop reel attribution and the trip's Reel list (supabase-api.ts:139-221)."""
    trip_place_ids = {stop["place_id"] for stop in rows["stops"]}
    declared = _unique(
        [reel_key(i["normalized_reel_url"]) for i in rows["inspiration"] if i.get("normalized_reel_url")]
        + await _declared_event_reels(client, trip_id)
    )
    cards = await _owner_cards(client, user_id)
    if declared:
        cards = [c for c in cards if c.get("normalized_url") in declared]

    cover_by_reel: dict[str, str] = {}
    reel_by_place: dict[str, str] = {}
    contributing: list[str] = []
    for card in cards:
        if card.get("thumbnail_url") and card.get("normalized_url"):
            cover_by_reel[reel_key(card["normalized_url"])] = card["thumbnail_url"]
        for mention in card.get("places") or []:
            place_id, source = mention.get("place_id"), mention.get("source_reel_url")
            if place_id and source and place_id in trip_place_ids:
                reel_by_place[place_id] = reel_key(source)
                contributing.append(reel_key(source))
    return {
        "cover_by_reel": cover_by_reel,
        "reel_by_place": reel_by_place,
        "reel_keys": _unique(declared + contributing),
    }


async def _suggestion_places(client, restaurants: list[dict], on_trip: set[str]) -> list[dict]:
    wanted = _unique(
        pid for r in restaurants for pid in (r.get("restaurant_place_id"), r.get("near_place_id"))
        if pid and pid not in on_trip
    )
    if not wanted:
        return []
    return await _rows(
        client.table("places").select(_PLACE_COLS).in_("id", wanted)
        .order("id").limit(MCP_MAX_SUGGESTION_PLACES + 1)
    )


def _inspiration(trip_id: str, table_rows: list[dict], context: dict) -> list[dict]:
    if table_rows:
        return [project_inspiration(row, context["cover_by_reel"]) for row in table_rows]
    return derived_inspiration(trip_id, context["reel_keys"], context["cover_by_reel"])


async def _assemble(client, user_id: str, trip: dict, rows: dict, flags: dict) -> dict:
    context = await _reel_context(client, user_id, trip["id"], rows)
    projected_stops = [project_trip_place(stop, context["reel_by_place"]) for stop in rows["stops"]]
    suggestion_rows = await _suggestion_places(
        client, rows["restaurants"], {s["place_id"] for s in rows["stops"]})
    inspiration = _inspiration(trip["id"], rows["inspiration"], context)

    bundle = {
        "trip": project_trip(trip),
        "inspiration": inspiration[:MCP_MAX_INSPIRATION],
        "places": [stop for stop, _ in projected_stops],
        "days": [project_day(row) for row in rows["days"]],
        "transport_legs": [project_leg(row) for row in rows["legs"]],
        "restaurants": [project_restaurant(row) for row in rows["restaurants"]],
        "hotels": [project_hotel(row) for row in rows["hotels"]],
        "events": [],
        "suggestion_places": [project_place(row) for row in suggestion_rows[:MCP_MAX_SUGGESTION_PLACES]],
    }
    truncated = {
        **flags,
        "restaurant_text": False,
        "inspiration": len(inspiration) > MCP_MAX_INSPIRATION,
        "suggestion_places": len(suggestion_rows) > MCP_MAX_SUGGESTION_PLACES,
        "quotes": any(dropped for _, dropped in projected_stops),
    }
    return {
        # Validate-then-dump normalizes every scalar to its wire form BEFORE the byte budget
        # measures it, so the measured size is the size that is sent.
        "bundle": McpTripBundle.model_validate(bundle).model_dump(mode="json"),
        "truncated": truncated,
        "saved_day_numbers": [row["day_number"] for row in rows["day_numbers"]],
    }


async def read_itinerary(client, user_id: str, trip_id: str, day: int | None) -> dict:
    """The bounded McpTripBundle response. Raises TripNotFound (-> 404) or
    mcp_budget.BundleTooLarge (-> 413); never returns an oversized success.

    Referential integrity is reconciled twice: after the SQL caps (a leg or restaurant whose
    stop was capped away is dropped and flagged) and again after the byte budget."""
    trip = await _owned_trip(client, user_id, trip_id)   # owner check BEFORE any child read
    rows, flags = await _child_rows(client, trip["id"], day)
    assembled = reconcile(await _assemble(client, user_id, trip, rows, flags))
    response = reconcile(fit_to_budget(assembled, protected_day=day))
    McpItineraryResponse.model_validate(response)       # contract guard on the reduced response
    return response
