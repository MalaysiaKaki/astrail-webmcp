"""Test-only fakes and fixture builders for the MCP read surface (test_mcp_read.py,
test_mcp_budget.py). Not imported by production code.

`FakeSupabase` models the PostgREST behaviour the reads depend on, because a fake that merely
returns rows would let every ordering and limit assertion pass whether or not production asked
for them:
  - `.order()` honours desc and Postgres null placement (ASC → NULLS LAST, DESC → NULLS FIRST,
    `nullsfirst=` overrides), multi-key, first call primary;
  - `.limit()` / `.range()` apply AFTER ordering, and every read is capped at PostgREST's default
    max-rows (1000), so an unpaged bulk read truncates exactly as it would in production;
  - `.or_()` understands the one keyset expression mcp_reads emits, and fails loudly on others;
  - `place:places(cols)` embeds by `place_id`; column lists project rows (so a column the read
    did not select is absent, as it would be).
`saved_reel_cards_for_user` is modelled from the migration: owner filter, (created_at, id) DESC
keyset, limit.
"""
from __future__ import annotations

import functools
import re
import uuid
from datetime import datetime, timedelta, timezone

MAX_ROWS = 1000
_KEYSET_RE = re.compile(
    r'^created_at\.lt\."(?P<c>[^"]+)",and\(created_at\.eq\."(?P=c)",id\.lt\."(?P<i>[^"]+)"\)$'
)
_EMBED_RE = re.compile(r"^(?P<alias>\w+):(?P<table>\w+)\((?P<cols>[^)]*)\)$")


def uid() -> str:
    return str(uuid.uuid4())


def instant(offset_s: int = 0) -> str:
    base = datetime(2026, 9, 1, 10, 0, 0, tzinfo=timezone.utc)
    return (base + timedelta(seconds=offset_s)).isoformat()


class Result:
    def __init__(self, data):
        self.data = data


def _split_cols(cols: str) -> list[str]:
    parts, depth, current = [], 0, ""
    for ch in cols:
        if ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        current += ch
    if current.strip():
        parts.append(current.strip())
    return parts


def _compare(specs, a: dict, b: dict) -> int:
    for col, desc, nulls_first in specs:
        va, vb = a.get(col), b.get(col)
        if va == vb:
            continue
        if va is None:
            return -1 if nulls_first else 1
        if vb is None:
            return 1 if nulls_first else -1
        result = -1 if va < vb else 1
        return -result if desc else result
    return 0


class FakeQuery:
    def __init__(self, client: "FakeSupabase", table: str):
        self.client, self.table = client, table
        self.cols = "*"
        self.filters: list[tuple] = []
        self.orders: list[tuple] = []
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._single = False

    def select(self, cols: str = "*"):
        self.cols = cols
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, values):
        self.filters.append(("in", col, list(values)))
        return self

    def or_(self, expr):
        match = _KEYSET_RE.match(expr)
        if not match:
            raise ValueError(f"fake .or_() models only the keyset expression, got {expr!r}")
        self.filters.append(("keyset", datetime.fromisoformat(match["c"]), match["i"]))
        return self

    def order(self, col, *, desc=False, nullsfirst=None, **unsupported):
        if unsupported:
            raise ValueError(f"unsupported order kwargs {unsupported}")
        self.orders.append((col, desc, desc if nullsfirst is None else nullsfirst))
        return self

    def limit(self, size, **unsupported):
        if unsupported:
            raise ValueError(f"unsupported limit kwargs {unsupported}")
        self._limit = size
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def maybe_single(self):
        self._single = True
        return self

    def _matches(self, row: dict) -> bool:
        for f in self.filters:
            if f[0] == "eq" and row.get(f[1]) != f[2]:
                return False
            if f[0] == "in" and row.get(f[1]) not in f[2]:
                return False
            if f[0] == "keyset":
                created = datetime.fromisoformat(row["created_at"])
                if not (created < f[1] or (created == f[1] and row["id"] < f[2])):
                    return False
        return True

    def _project(self, row: dict) -> dict:
        if self.cols.strip() == "*":
            return dict(row)
        out = {}
        for col in _split_cols(self.cols):
            embed = _EMBED_RE.match(col)
            if embed:
                target = next(
                    (p for p in self.client.db.get(embed["table"], []) if p["id"] == row.get("place_id")),
                    None,
                )
                sub = [c.strip() for c in embed["cols"].split(",")]
                out[embed["alias"]] = {c: target.get(c) for c in sub} if target else None
            elif col in row:
                out[col] = row[col]
        return out

    async def execute(self):
        self.client.log.append((self.table, tuple(self.filters)))
        if self.table in self.client.fail_tables:
            raise RuntimeError(f"store read failed for SENTINEL {self.table}")
        rows = [r for r in self.client.db.get(self.table, []) if self._matches(r)]
        rows.sort(key=functools.cmp_to_key(functools.partial(_compare, self.orders)))
        if self._range:
            rows = rows[self._range[0]: self._range[1] + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        rows = [self._project(r) for r in rows[:MAX_ROWS]]
        if self._single:
            return None if not rows else Result(rows[0])
        return Result(rows)


class FakeRpc:
    def __init__(self, client: "FakeSupabase", name: str, params: dict):
        self.client, self.name, self.params = client, name, params

    async def execute(self):
        self.client.rpc_calls.append((self.name, dict(self.params)))
        if self.name in self.client.fail_rpcs:
            raise RuntimeError("rpc failed")
        if self.name != "saved_reel_cards_for_user":
            raise ValueError(f"unexpected rpc {self.name}")
        p = self.params
        cards = [c for c in self.client.db.get("_cards", []) if c["user_id"] == p["p_user_id"]]
        if p["p_after_created"] is not None:
            after = datetime.fromisoformat(p["p_after_created"])
            cards = [c for c in cards if (datetime.fromisoformat(c["created_at"]), c["id"]) < (after, p["p_after_id"])]
        cards.sort(key=lambda c: (datetime.fromisoformat(c["created_at"]), c["id"]), reverse=True)
        return Result([dict(c) for c in cards[: p["p_limit"]]])


class FakeSupabase:
    def __init__(self, db: dict | None = None):
        self.db: dict[str, list[dict]] = db if db is not None else {}
        self.log: list[tuple] = []
        self.rpc_calls: list[tuple] = []
        self.fail_tables: set[str] = set()
        self.fail_rpcs: set[str] = set()

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, name, params):
        return FakeRpc(self, name, params)

    def add(self, table: str, row: dict) -> dict:
        self.db.setdefault(table, []).append(row)
        return row


# ---- Row builders (column sets match supabase/migrations) ----

def place_row(**over) -> dict:
    row = {
        "id": uid(), "name": "Senso-ji", "name_local": "浅草寺", "place_type": "attraction",
        "lat": 35.7148, "lng": 139.7967, "country": "Japan", "city": "Tokyo", "area": "Asakusa",
        "aliases": ["Asakusa Temple"], "source_summary": {"private": "internal"},
        "country_code": "JP", "country_name": "Japan", "embedding": None,
    }
    row.update(over)
    return row


def trip_row(user_id: str, **over) -> dict:
    row = {
        "id": uid(), "user_id": user_id, "status": "complete", "destination_hint": "Tokyo",
        "inferred_destination": "Tokyo, Japan", "start_date": "2026-10-01", "end_date": "2026-10-03",
        "origin_city": "Singapore", "budget_level": "mid_range", "adult_count": 2, "child_count": 0,
        "room_count": 1, "preference_sources": ["explicit", "memory", "bogus"],
        "preference_summary": "Likes temples", "title": "Tokyo in three days", "summary": "Temples and food.",
        "tradeoffs": {"notes": [{"kind": "note"}], "comparisons": []},
        "occupancy_json": {}, "persona_snapshot_json": {"secret": "x"},
        "created_at": instant(), "updated_at": instant(),
    }
    row.update(over)
    return row


def day_row(trip_id: str, day_number: int, **over) -> dict:
    row = {
        "id": uid(), "trip_id": trip_id, "day_number": day_number,
        "day_date": f"2026-10-{day_number:02d}" if day_number <= 28 else None,
        "title": f"Day {day_number}", "summary": "A day.", "weather_summary": "Sunny",
        "weather_source": "open_meteo", "weather_payload": {"raw": [1, 2, 3]},
        "created_at": instant(), "updated_at": instant(),
    }
    row.update(over)
    return row


def stop_row(trip_id: str, place_id: str, day_number: int | None, sort_order: int | None, **over) -> dict:
    row = {
        "id": uid(), "trip_id": trip_id, "place_id": place_id, "source_type": "reel_extracted",
        "evidence_json": {
            "confidence": 0.9, "source_url": "https://example.com/guide",
            "source_reel_url": None, "quote": "Go early to Senso-ji", "quotes": ["Go early"],
            "rationale": None, "evidence_kind": "reel_quote",
        },
        "day_number": day_number, "sort_order": sort_order, "created_at": instant(),
    }
    row.update(over)
    return row


def leg_row(trip_id: str, leg_order: int, **over) -> dict:
    row = {
        "id": uid(), "trip_id": trip_id, "trip_day_id": None, "from_place_id": None, "to_place_id": None,
        "leg_order": leg_order, "transport_mode": "walk", "routing_provider": "mapbox",
        "routing_profile": "walking", "status": "ok", "duration_seconds": 600, "distance_meters": 800,
        "route_geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        "warning": None, "raw_payload": {"x": 1}, "created_at": instant(),
    }
    row.update(over)
    return row


def restaurant_row(trip_id: str, **over) -> dict:
    row = {
        "id": uid(), "trip_id": trip_id, "trip_day_id": None, "restaurant_place_id": None,
        "near_place_id": None, "cuisine": "Ramen", "summary": "Rich broth.",
        "source_url": "https://example.com/ramen", "evidence_json": {"k": "v"},
        "preference_match_json": {"k": "v"}, "created_at": instant(),
    }
    row.update(over)
    return row


def hotel_row(trip_id: str, **over) -> dict:
    row = {
        "id": uid(), "trip_id": trip_id, "trip_day_id": None, "base_place_id": None,
        "name": "Hotel Gracery", "area": "Shinjuku", "star_rating": 4,
        "price_snapshot": {"currency": "USD", "pricePerNight": 180, "totalPrice": 360, "packageId": "SECRET"},
        "travala_hotel_id": "tv-123", "travala_session_id": "SESSION-SECRET",
        "travala_package_id": "PACKAGE-SECRET",
        "travala_result_json": {
            "rating": 8.6, "refundability": "refundable", "packageId": "PACKAGE-SECRET",
            "cancellation": {"free_cancellation_until_utc": "2026-09-28T00:00:00Z"},
        },
        "preference_match_json": {"k": "v"}, "source": "travala", "status": "suggested",
        "searched_at": instant(), "created_at": instant(), "lat": 35.69, "lng": 139.70,
        "geo_status": "placed", "route_score": 900.5, "rank": 1, "is_recommended": True,
        "place_durations": {"p": 300},
    }
    row.update(over)
    return row


def card(user_id: str, normalized_url: str, *, created_at: str | None = None, places=None, **over) -> dict:
    row = {
        "id": uid(), "user_id": user_id, "normalized_url": normalized_url,
        "source_platform": "instagram", "reel_cache_id": uid(), "analysis_status": "organized",
        "personal_label": None, "retry_after": None, "analyzed_at": instant(),
        "created_at": created_at or instant(), "updated_at": instant(), "caption": "cap",
        "thumbnail_url": None, "places": places or [], "has_current_cache": True,
    }
    row.update(over)
    return row
