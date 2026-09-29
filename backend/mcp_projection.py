"""Pure row → contract projection for the MCP read surface (docs/mcp-app/PLAN.md §5.2).

Replicates the browser's `getTrip` projection (frontend/lib/trip/supabase-api.ts) on
service-role rows, then applies the MCP text caps and documented defaults
(MCP_BUNDLE_DEFAULTS in frontend/lib/mcp/contract.ts):

- text over its cap is cut and ends in "…"; a URL over 512 chars or not http(s) becomes null
  and is NEVER cut (a truncated URL is a different, possibly hostile, link);
- internal fields go out as the default the type already permits ({} / [] / null), never
  invented data;
- Travala's raw blob yields guest_rating / refundable / free_cancellation_until and is dropped
  with the session and package ids.

No I/O here, so every rule is testable without a database.
"""
from __future__ import annotations

import math
import re
from urllib.parse import urlsplit

from models.mcp import (
    MCP_NAME_CHARS, MCP_TEXT_CHARS, MCP_TITLE_CHARS, MCP_URL_CHARS, MCP_WARNING_CHARS,
    PRICE_SNAPSHOT_KEYS,
)

ELLIPSIS = "…"
# Not in MCP_LIMITS: per-row list bounds the contract leaves open. Quotes are the only one a
# reader would miss, so dropping one sets truncated.quotes; aliases are not rendered.
MAX_EVIDENCE_QUOTES = 5
MAX_ALIASES = 10
# isoInstant in contract.ts is max 64 chars; the Travala cancellation instant rides the same bound.
INSTANT_CHARS = 64

_PREFERENCE_SOURCES = frozenset({"explicit", "memory", "inferred_default"})
_EVIDENCE_KINDS = frozenset({
    "reel_quote", "requested_by_you", "research", "mapbox_route", "open_meteo",
    "travala_hotel_search", "memory_preference", "inferred_default", "suggested_by_astrail",
})
# backend/pipeline/persist.py::_evidence_kind — used only when a stored row lacks a valid kind.
_KIND_BY_SOURCE = {
    "reel_extracted": "reel_quote",
    "user_requested": "requested_by_you",
    "agent_suggested": "suggested_by_astrail",
}
# frontend/lib/trip/parse-inspiration.ts IG_RE + CANONICAL_PATH, then supabase-api.ts `reelKey`
# (trailing slash stripped) — the key both sides of the reel-attribution join agree on.
_IG_RE = re.compile(
    r"(?:^|//|\s)(?:www\.|m\.)?instagram\.com/(?:share/)?(reel|reels|p|tv)/([A-Za-z0-9_-]+)",
    re.IGNORECASE,
)
_IG_CANONICAL = {"reel": "reel", "reels": "reel", "p": "p", "tv": "p"}
_IG_HOSTS = frozenset({"instagram.com", "www.instagram.com"})
_IG_PATH_RE = re.compile(r"^/(reels?|p)/([A-Za-z0-9_-]+)/?$")
_SHORTCODE_CHARS = 64


# ---- Scalars ----

def cap_text(value, limit: int) -> str | None:
    """Non-strings become None; over-limit text is cut to `limit` chars ending in "…"."""
    if not isinstance(value, str):
        return None
    return value if len(value) <= limit else value[: limit - 1] + ELLIPSIS


def cap_required_text(value, limit: int) -> str:
    return cap_text(value, limit) or ""


def safe_url(value) -> str | None:
    """An http(s) URL of at most MCP_URL_CHARS, verbatim, or None. Never shortened."""
    if not isinstance(value, str) or not value or len(value) > MCP_URL_CHARS:
        return None
    if any(ch.isspace() or ord(ch) < 0x20 for ch in value):
        return None
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    return value


def finite_number(value) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) else None


def bounded_instant(value) -> str | None:
    return value if isinstance(value, str) and 0 < len(value) <= INSTANT_CHARS else None


def _one_of(value, allowed) -> str | None:
    return value if value in allowed else None


# ---- Reel URL keys ----

def reel_key(url: str) -> str:
    """supabase-api.ts `reelKey`: stored and frontend-normalized forms differ only by '/'."""
    return url.rstrip("/")


def frontend_reel_key(raw) -> str | None:
    """parse-inspiration.ts normalizeReelUrl → reelKey, for create_trip event `reel_urls`."""
    if not isinstance(raw, str):
        return None
    match = _IG_RE.search(raw)
    if not match:
        return None
    return f"https://www.instagram.com/{_IG_CANONICAL[match.group(1).lower()]}/{match.group(2)}"


def reel_kind_and_shortcode(normalized_url, platform) -> tuple[str, str | None]:
    """instagram /reel/ and /reels/ → reel, /p/ → post; anything else → other, no shortcode."""
    if platform != "instagram" or not isinstance(normalized_url, str):
        return "other", None
    try:
        parts = urlsplit(normalized_url)
    except ValueError:
        return "other", None
    match = _IG_PATH_RE.match(parts.path) if (parts.hostname or "").lower() in _IG_HOSTS else None
    if not match or len(match.group(2)) > _SHORTCODE_CHARS:
        return "other", None
    return ("post" if match.group(1).lower() == "p" else "reel"), match.group(2)


# ---- Rows ----

def project_place(row: dict) -> dict:
    aliases = [a for a in (row.get("aliases") or []) if isinstance(a, str)][:MAX_ALIASES]
    return {
        "id": row["id"],
        "name": cap_required_text(row.get("name"), MCP_NAME_CHARS),
        "name_local": cap_text(row.get("name_local"), MCP_NAME_CHARS),
        "place_type": row.get("place_type"),
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "country": cap_text(row.get("country"), MCP_NAME_CHARS),
        "city": cap_text(row.get("city"), MCP_NAME_CHARS),
        "area": cap_text(row.get("area"), MCP_NAME_CHARS),
        "aliases": [cap_required_text(a, MCP_NAME_CHARS) for a in aliases],
        "source_summary": {},
    }


def project_trip(row: dict) -> dict:
    sources = row.get("preference_sources")
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "status": row.get("status"),
        "destination_hint": cap_text(row.get("destination_hint"), MCP_NAME_CHARS),
        "inferred_destination": cap_text(row.get("inferred_destination"), MCP_NAME_CHARS),
        "start_date": row.get("start_date"),
        "end_date": row.get("end_date"),
        "origin_city": cap_text(row.get("origin_city"), MCP_NAME_CHARS),
        "budget_level": row.get("budget_level"),
        "adult_count": row.get("adult_count"),
        "child_count": row.get("child_count"),
        "room_count": row.get("room_count"),
        "preference_sources": [s for s in (sources if isinstance(sources, list) else [])
                               if s in _PREFERENCE_SOURCES],
        "preference_summary": cap_text(row.get("preference_summary"), MCP_TEXT_CHARS),
        "title": cap_text(row.get("title"), MCP_TITLE_CHARS),
        "summary": cap_text(row.get("summary"), MCP_TEXT_CHARS),
        "tradeoffs": {"notes": [], "comparisons": []},
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def project_evidence(raw, source_type: str, backfill_reel: str | None) -> tuple[dict, bool]:
    """Returns (evidence, quotes_dropped). `backfill_reel` follows supabase-api.ts:226 — only a
    reel_extracted stop with no recorded reel gets one, never overwriting the backend's."""
    ev = raw if isinstance(raw, dict) else {}
    quotes = [q for q in (ev.get("quotes") or []) if isinstance(q, str)]
    kind = ev.get("evidence_kind")
    recorded_reel = ev.get("source_reel_url")
    reel = recorded_reel if recorded_reel else (
        backfill_reel if source_type == "reel_extracted" else None)
    evidence = {
        "confidence": finite_number(ev.get("confidence")) or 0,
        "source_url": safe_url(ev.get("source_url")),
        "source_reel_url": safe_url(reel),
        "quote": cap_text(ev.get("quote"), MCP_TEXT_CHARS),
        "quotes": [cap_required_text(q, MCP_TEXT_CHARS) for q in quotes[:MAX_EVIDENCE_QUOTES]],
        "rationale": cap_text(ev.get("rationale"), MCP_TEXT_CHARS),
        "evidence_kind": kind if kind in _EVIDENCE_KINDS
        else _KIND_BY_SOURCE.get(source_type, "suggested_by_astrail"),
    }
    return evidence, len(quotes) > MAX_EVIDENCE_QUOTES


def project_trip_place(row: dict, reel_by_place: dict[str, str]) -> tuple[dict, bool]:
    evidence, quotes_dropped = project_evidence(
        row.get("evidence_json"), row.get("source_type"), reel_by_place.get(row["place_id"]))
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "place_id": row["place_id"],
        "source_type": row.get("source_type"),
        "evidence_json": evidence,
        "day_number": row.get("day_number"),
        "sort_order": row.get("sort_order"),
        "place": project_place(row["place"]),
    }, quotes_dropped


def project_day(row: dict) -> dict:
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "day_number": row.get("day_number"),
        "day_date": row.get("day_date"),
        "title": cap_text(row.get("title"), MCP_TITLE_CHARS),
        "summary": cap_text(row.get("summary"), MCP_TEXT_CHARS),
        "weather_summary": cap_text(row.get("weather_summary"), MCP_TEXT_CHARS),
        "weather_source": _one_of(row.get("weather_source"), ("open_meteo", "manual", "none")),
        "weather_payload": {},
    }


def project_leg(row: dict) -> dict:
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "trip_day_id": row.get("trip_day_id"),
        "from_place_id": row.get("from_place_id"),
        "to_place_id": row.get("to_place_id"),
        "leg_order": row.get("leg_order"),
        "transport_mode": row.get("transport_mode"),
        "routing_provider": row.get("routing_provider"),
        "routing_profile": row.get("routing_profile"),
        "status": row.get("status"),
        "duration_seconds": finite_number(row.get("duration_seconds")),
        "distance_meters": finite_number(row.get("distance_meters")),
        "route_geometry": None,
        "warning": cap_text(row.get("warning"), MCP_WARNING_CHARS),
    }


def project_restaurant(row: dict) -> dict:
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "trip_day_id": row.get("trip_day_id"),
        "restaurant_place_id": row.get("restaurant_place_id"),
        "near_place_id": row.get("near_place_id"),
        "cuisine": cap_text(row.get("cuisine"), MCP_NAME_CHARS),
        "summary": cap_required_text(row.get("summary"), MCP_TEXT_CHARS),
        "source_url": safe_url(row.get("source_url")),
        "evidence_json": {},
        "preference_match_json": {},
    }


def _price_snapshot(raw) -> dict:
    snapshot = raw if isinstance(raw, dict) else {}
    kept = {}
    for key, kind in PRICE_SNAPSHOT_KEYS.items():
        value = snapshot.get(key)
        if kind is str and isinstance(value, str):
            kept[key] = cap_required_text(value, MCP_NAME_CHARS)
        elif kind is float and finite_number(value) is not None:
            kept[key] = value
    return kept


def project_hotel(row: dict) -> dict:
    """supabase-api.ts `projectHotels`: lift three facts out of travala_result_json, then drop
    the blob and the session/package ids by never copying them."""
    raw = row.get("travala_result_json")
    blob = raw if isinstance(raw, dict) else {}
    cancellation = blob.get("cancellation") if isinstance(blob.get("cancellation"), dict) else {}
    refundability = blob.get("refundability")
    hotel_id = row.get("travala_hotel_id")
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "trip_day_id": row.get("trip_day_id"),
        "base_place_id": row.get("base_place_id"),
        "name": cap_required_text(row.get("name"), MCP_NAME_CHARS),
        "area": cap_text(row.get("area"), MCP_NAME_CHARS),
        "star_rating": finite_number(row.get("star_rating")),
        "price_snapshot": _price_snapshot(row.get("price_snapshot")),
        "travala_hotel_id": hotel_id if isinstance(hotel_id, str) and len(hotel_id) <= MCP_NAME_CHARS
        else None,
        "guest_rating": finite_number(blob.get("rating")),
        "refundable": refundability == "refundable" if isinstance(refundability, str) else None,
        "free_cancellation_until": bounded_instant(cancellation.get("free_cancellation_until_utc")),
        "preference_match_json": {},
        "source": row.get("source"),
        "status": row.get("status"),
        "searched_at": bounded_instant(row.get("searched_at")),
        "lat": finite_number(row.get("lat")),
        "lng": finite_number(row.get("lng")),
        "geo_status": row.get("geo_status"),
        "route_score": finite_number(row.get("route_score")),
        "rank": row.get("rank"),
        "is_recommended": bool(row.get("is_recommended")),
        "place_durations": {},
    }


def project_inspiration(row: dict, cover_by_reel: dict[str, str]) -> dict:
    url = row.get("normalized_reel_url")
    cover = cover_by_reel.get(reel_key(url)) if isinstance(url, str) and url else None
    return {
        "id": str(row["id"]),
        "trip_id": row["trip_id"],
        "item_type": row.get("item_type"),
        "source": row.get("source"),
        "normalized_reel_url": safe_url(url),
        "reel_cache_id": row.get("reel_cache_id"),
        "requested_place_text": cap_text(row.get("requested_place_text"), MCP_NAME_CHARS),
        "resolved_place_id": row.get("resolved_place_id"),
        "status": row.get("status"),
        "thumbnail_url": safe_url(cover),
    }


def derived_inspiration(trip_id: str, reel_keys: list[str], cover_by_reel: dict[str, str]) -> list[dict]:
    """supabase-api.ts:210 — `trip_inspiration_items` has no producer, so a trip's Reels are
    reconstructed from what it declared plus what actually placed its stops."""
    return [
        {
            "id": f"derived-reel-{i}",
            "trip_id": trip_id,
            "item_type": "reel_url",
            "source": "manual_paste",
            "normalized_reel_url": safe_url(url),
            "reel_cache_id": None,
            "requested_place_text": None,
            "resolved_place_id": None,
            "status": "valid",
            "thumbnail_url": safe_url(cover_by_reel.get(url)),
        }
        for i, url in enumerate(reel_keys)
    ]


def project_trip_summary(row: dict, day_count: int) -> dict:
    destination = row.get("inferred_destination") or row.get("destination_hint")
    return {
        "trip_id": row["id"],
        "title": cap_text(row.get("title"), MCP_TITLE_CHARS),
        "destination": cap_text(destination, MCP_NAME_CHARS),
        "status": row.get("status"),
        "start_date": row.get("start_date"),
        "end_date": row.get("end_date"),
        "day_count": day_count,
        "created_at": row.get("created_at"),
    }


def project_saved_reel(card: dict, max_places: int) -> dict:
    places = [p for p in (card.get("places") or []) if isinstance(p, dict)]
    kind, shortcode = reel_kind_and_shortcode(card.get("normalized_url"), card.get("source_platform"))
    return {
        "reel_id": card["id"],
        "platform": card.get("source_platform"),
        "kind": kind,
        "shortcode": shortcode,
        "status": card.get("analysis_status"),
        "saved_at": card.get("created_at"),
        "place_count": len(places),
        "places": [
            {"name": cap_required_text(p.get("name"), MCP_NAME_CHARS),
             "country_name": cap_text(p.get("country_name"), MCP_NAME_CHARS)}
            for p in places[:max_places]
        ],
    }
