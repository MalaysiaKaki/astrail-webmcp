"""The itinerary byte budget (docs/mcp-app/PLAN.md §5.2), as a pure function.

`serialized_utf8(response) <= MCP_BUNDLE_BYTES`, re-measured after EVERY step, in this order:
  1. drop `inspiration` (covers become placeholders)                  -> truncated.inspiration
  2. restaurant `summary` -> '' (the type is string, not nullable)     -> truncated.restaurant_text
  3. evidence `quotes` -> [], then primary `quote` -> null, one day at
     a time from the last day backwards (unscheduled stops count last) -> truncated.quotes
  4. terminal: remove whole days in DESCENDING day_number, each with its stops, the legs and
     restaurants that reference them, and any suggestion_places no remaining restaurant
     references — so every id left in the bundle still resolves. The requested `day` is never
     removed; unscheduled stops (day_number null) go first, as they order last.
  5. if the one retained day (or a bundle with no days) still does not fit -> BundleTooLarge.

Every reduced value stays assignable to the unchanged row types; nothing is widened. Each step
returns NEW dicts and leaves its input untouched. The measured serialization is the exact byte
string the route returns (`dumps`), so "fits" here means fits on the wire.
"""
from __future__ import annotations

import json
from collections.abc import Iterator

from models.mcp import MCP_BUNDLE_BYTES


class BundleTooLarge(Exception):
    """Even the smallest honest reduction exceeds the budget."""


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def serialized_size(obj) -> int:
    return len(dumps(obj).encode("utf-8"))


def fit_to_budget(response: dict, *, protected_day: int | None, budget: int = MCP_BUNDLE_BYTES) -> dict:
    """Return the first reduction of `response` that fits, or raise BundleTooLarge."""
    for candidate in _reductions(response, protected_day):
        if serialized_size(candidate) <= budget:
            return candidate
    raise BundleTooLarge()


def _reductions(response: dict, protected_day: int | None) -> Iterator[dict]:
    current = response
    yield current
    for step in (_drop_inspiration, _blank_restaurant_text):
        current = step(current)
        yield current
    for current in _quote_reductions(current):
        yield current
    yield from _day_removals(current, protected_day)


def _with(response: dict, flags: dict, **bundle_changes) -> dict:
    return {
        **response,
        "bundle": {**response["bundle"], **bundle_changes},
        "truncated": {**response["truncated"], **flags},
    }


def _drop_inspiration(response: dict) -> dict:
    if not response["bundle"]["inspiration"]:
        return response
    return _with(response, {"inspiration": True}, inspiration=[])


def _blank_restaurant_text(response: dict) -> dict:
    restaurants = response["bundle"]["restaurants"]
    if not any(r["summary"] for r in restaurants):
        return response
    blanked = [{**r, "summary": ""} for r in restaurants]
    return _with(response, {"restaurant_text": True}, restaurants=blanked)


def _stop_groups_last_first(places: list[dict]) -> list[int | None]:
    """Day numbers present on stops, last day first; unscheduled (None) sorts last, so first."""
    numbers = sorted({p["day_number"] for p in places if p["day_number"] is not None}, reverse=True)
    unscheduled = [None] if any(p["day_number"] is None for p in places) else []
    return unscheduled + numbers


def _reduce_evidence(response: dict, group: int | None, field: str, value) -> dict | None:
    places = response["bundle"]["places"]
    changed = False
    reduced = []
    for stop in places:
        if stop["day_number"] == group and stop["evidence_json"][field] != value:
            changed = True
            stop = {**stop, "evidence_json": {**stop["evidence_json"], field: value}}
        reduced.append(stop)
    return _with(response, {"quotes": True}, places=reduced) if changed else None


def _quote_reductions(response: dict) -> Iterator[dict]:
    current = response
    for field, value in (("quotes", []), ("quote", None)):
        for group in _stop_groups_last_first(current["bundle"]["places"]):
            reduced = _reduce_evidence(current, group, field, value)
            if reduced is not None:
                current = reduced
                yield current


def _removable_units(bundle: dict, protected_day: int | None) -> list[int | None]:
    scheduled = sorted(
        {d["day_number"] for d in bundle["days"]}
        | {p["day_number"] for p in bundle["places"] if p["day_number"] is not None},
        reverse=True,
    )
    keep = protected_day if protected_day in scheduled else (scheduled[-1] if scheduled else None)
    unscheduled = [None] if any(p["day_number"] is None for p in bundle["places"]) else []
    return unscheduled + [n for n in scheduled if n != keep]


def _remove_unit(response: dict, unit: int | None) -> dict:
    bundle = response["bundle"]
    day_ids = {d["id"] for d in bundle["days"] if unit is not None and d["day_number"] == unit}
    place_ids = {p["place_id"] for p in bundle["places"] if p["day_number"] == unit}

    def touches(row: dict, *keys: str) -> bool:
        return row.get("trip_day_id") in day_ids or any(row.get(k) in place_ids for k in keys)

    days = [d for d in bundle["days"] if d["id"] not in day_ids]
    places = [p for p in bundle["places"] if p["day_number"] != unit]
    legs = [leg for leg in bundle["transport_legs"] if not touches(leg, "from_place_id", "to_place_id")]
    restaurants = [
        r for r in bundle["restaurants"] if not touches(r, "restaurant_place_id", "near_place_id")
    ]
    referenced = {r[k] for r in restaurants for k in ("restaurant_place_id", "near_place_id") if r[k]}
    suggestion_places = [p for p in bundle["suggestion_places"] if p["id"] in referenced]

    flags = {
        name: True
        for name, before, after in (
            ("days", bundle["days"], days),
            ("stops", bundle["places"], places),
            ("legs", bundle["transport_legs"], legs),
            ("restaurants", bundle["restaurants"], restaurants),
            ("suggestion_places", bundle["suggestion_places"], suggestion_places),
        )
        if len(after) < len(before)
    }
    return _with(
        response, flags, days=days, places=places, transport_legs=legs,
        restaurants=restaurants, suggestion_places=suggestion_places,
    )


def _day_removals(response: dict, protected_day: int | None) -> Iterator[dict]:
    current = response
    while units := _removable_units(current["bundle"], protected_day):
        current = _remove_unit(current, units[0])
        yield current


def reconcile(response: dict) -> dict:
    """Drop every leg or restaurant that points at a stop, day or place the bundle no longer
    carries (after SQL caps, and again after the budget), flagging what it drops, then drop
    suggestion_places no remaining restaurant references. Returns a new response."""
    bundle = response["bundle"]
    place_ids = {p["place_id"] for p in bundle["places"]}
    day_ids = {d["id"] for d in bundle["days"]}
    suggestion_ids = {p["id"] for p in bundle["suggestion_places"]}

    def resolves(value, known: set) -> bool:
        return value is None or value in known

    legs = [
        leg for leg in bundle["transport_legs"]
        if resolves(leg["trip_day_id"], day_ids)
        and resolves(leg["from_place_id"], place_ids) and resolves(leg["to_place_id"], place_ids)
    ]
    restaurants = [
        r for r in bundle["restaurants"]
        if resolves(r["trip_day_id"], day_ids)
        and resolves(r["restaurant_place_id"], place_ids | suggestion_ids)
        and resolves(r["near_place_id"], place_ids | suggestion_ids)
    ]
    referenced = {r[k] for r in restaurants for k in ("restaurant_place_id", "near_place_id") if r[k]}
    suggestion_places = [p for p in bundle["suggestion_places"] if p["id"] in referenced]
    flags = {
        name: True
        for name, before, after in (
            ("legs", bundle["transport_legs"], legs),
            ("restaurants", bundle["restaurants"], restaurants),
            ("suggestion_places", bundle["suggestion_places"], suggestion_places),
        )
        if len(after) < len(before)
    }
    if not flags:
        return response
    return _with(response, flags, transport_legs=legs, restaurants=restaurants,
                 suggestion_places=suggestion_places)
