"""/internal/mcp/v1/* read endpoints (api/mcp_read.py + mcp_reads.py; PLAN §4.3, §5.2, §7.2).

The delegation dependency is overridden here with one that stashes the user id exactly like
the real verifier (test_auth_delegation.py covers the verifier itself, and one end-to-end call
through it). Reads run against mcp_test_support.FakeSupabase, which honours ordering, null
placement, limits and PostgREST's max-rows cap, so ordering and truncation assertions are real.

Where node and the frontend's zod are installed, every response is also validated against the
REAL contract.ts schemas (the same ones the gateway runs); elsewhere those checks skip and the
hand-mirrored key sets below still pin the wire shape.
"""
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

import httpx
import pytest
from fastapi import Request

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

import api.mcp_read as mcp_read  # noqa: E402
import main  # noqa: E402
from auth_delegation import require_delegation  # noqa: E402
from mcp_reads import encode_cursor  # noqa: E402
from mcp_test_support import (  # noqa: E402
    FakeSupabase, card, day_row, hotel_row, instant, leg_row, place_row, restaurant_row,
    stop_row, trip_row, uid,
)
from rate_limit import limiter  # noqa: E402

USER = uid()
OTHER = uid()
BUDGET = 256 * 1024
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
CONTRACT = FRONTEND / "lib" / "mcp" / "contract.ts"


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    yield
    main.app.dependency_overrides.clear()
    limiter.reset()


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()

    async def _client():
        return fake

    async def _delegated(request: Request) -> str:
        request.state.user_id = USER
        return USER

    monkeypatch.setattr(mcp_read, "get_supabase_client", _client)
    main.app.dependency_overrides[require_delegation] = _delegated
    return fake


async def post(path: str, body) -> httpx.Response:
    content = body if isinstance(body, (bytes, str)) else json.dumps(body)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as c:
        resp = await c.post(f"/internal/mcp/v1{path}", content=content,
                            headers={"content-type": "application/json"})
    if resp.status_code == 200:
        assert len(resp.content) <= BUDGET, "a success must never exceed the byte budget"
    return resp


# ---- zod contract (real contract.ts) ----

_ZOD_SCRIPT = """
import * as contract from %s;
let raw = '';
process.stdin.on('data', (d) => { raw += d }).on('end', () => {
  const out = JSON.parse(raw).map(({ schema, value }) => {
    const r = contract[schema].safeParse(value);
    return r.success ? null : JSON.stringify(r.error.issues.slice(0, 3));
  });
  process.stdout.write(JSON.stringify(out));
});
"""


def _zod_available() -> bool:
    return bool(shutil.which("node")) and (FRONTEND / "node_modules" / "zod").is_dir() and CONTRACT.is_file()


def zod_check(pairs: list[tuple[str, object]]) -> None:
    """Validate each (schemaName, value) with contract.ts; skip where node/zod are absent."""
    if not _zod_available():
        pytest.skip("node + frontend/node_modules/zod not installed")
    script = _ZOD_SCRIPT % json.dumps(CONTRACT.as_uri())
    proc = subprocess.run(
        ["node", "--no-warnings", "--input-type=module", "-e", script],
        input=json.dumps([{"schema": s, "value": v} for s, v in pairs]),
        capture_output=True, text=True, cwd=FRONTEND, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    failures = [(s, err) for (s, _), err in zip(pairs, json.loads(proc.stdout)) if err]
    assert failures == []


# ---- fixture trips ----

def seed_trip(db: FakeSupabase, user_id: str = USER, *, days=(1, 2, 3), **trip_over) -> dict:
    trip = db.add("trips", trip_row(user_id, **trip_over))
    for n in days:
        db.add("trip_days", day_row(trip["id"], n))
    return trip


def seed_stop(db, trip, day_number, sort_order, **over):
    place = db.add("places", place_row(**over.pop("place", {})))
    return db.add("trip_places", stop_row(trip["id"], place["id"], day_number, sort_order, **over)), place


# ---- hand-mirrored wire shape (contract.ts) ----

KEYS = {
    "bundle": {"trip", "inspiration", "places", "days", "transport_legs", "restaurants", "hotels",
               "events", "suggestion_places"},
    "trip": {"id", "user_id", "status", "destination_hint", "inferred_destination", "start_date",
             "end_date", "origin_city", "budget_level", "adult_count", "child_count", "room_count",
             "preference_sources", "preference_summary", "title", "summary", "tradeoffs",
             "created_at", "updated_at"},
    "place": {"id", "name", "name_local", "place_type", "lat", "lng", "country", "city", "area",
              "aliases", "source_summary"},
    "stop": {"id", "trip_id", "place_id", "source_type", "evidence_json", "day_number", "sort_order", "place"},
    "evidence": {"confidence", "source_url", "source_reel_url", "quote", "quotes", "rationale", "evidence_kind"},
    "day": {"id", "trip_id", "day_number", "day_date", "title", "summary", "weather_summary",
            "weather_source", "weather_payload"},
    "leg": {"id", "trip_id", "trip_day_id", "from_place_id", "to_place_id", "leg_order",
            "transport_mode", "routing_provider", "routing_profile", "status", "duration_seconds",
            "distance_meters", "route_geometry", "warning"},
    "restaurant": {"id", "trip_id", "trip_day_id", "restaurant_place_id", "near_place_id", "cuisine",
                   "summary", "source_url", "evidence_json", "preference_match_json"},
    "hotel": {"id", "trip_id", "trip_day_id", "base_place_id", "name", "area", "star_rating",
              "price_snapshot", "travala_hotel_id", "guest_rating", "refundable",
              "free_cancellation_until", "preference_match_json", "source", "status", "searched_at",
              "lat", "lng", "geo_status", "route_score", "rank", "is_recommended", "place_durations"},
    "inspiration": {"id", "trip_id", "item_type", "source", "normalized_reel_url", "reel_cache_id",
                    "requested_place_text", "resolved_place_id", "status", "thumbnail_url"},
    "truncated": {"days", "stops", "legs", "restaurants", "restaurant_text", "hotels", "inspiration",
                  "suggestion_places", "quotes"},
    "trip_summary": {"trip_id", "title", "destination", "status", "start_date", "end_date",
                     "day_count", "created_at"},
    "reel": {"reel_id", "platform", "kind", "shortcode", "status", "saved_at", "place_count", "places"},
}


def assert_itinerary_shape(data: dict) -> None:
    assert set(data) == {"bundle", "truncated", "saved_day_numbers"}
    b = data["bundle"]
    assert set(b) == KEYS["bundle"]
    assert set(b["trip"]) == KEYS["trip"]
    assert set(data["truncated"]) == KEYS["truncated"]
    assert all(isinstance(v, bool) for v in data["truncated"].values())
    for stop in b["places"]:
        assert set(stop) == KEYS["stop"]
        assert set(stop["evidence_json"]) == KEYS["evidence"]
        assert set(stop["place"]) == KEYS["place"]
    for key, rows in (("day", b["days"]), ("leg", b["transport_legs"]), ("restaurant", b["restaurants"]),
                      ("hotel", b["hotels"]), ("inspiration", b["inspiration"]),
                      ("place", b["suggestion_places"])):
        for row in rows:
            assert set(row) == KEYS[key], key
    for hotel in b["hotels"]:
        assert set(hotel["price_snapshot"]) <= {"currency", "pricePerNight", "totalPrice"}
        assert None not in hotel["price_snapshot"].values()   # optional keys: absent, never null


# ---- itinerary: owner scoping ----

async def test_foreign_trip_is_404_and_no_child_table_is_read(db):
    trip = seed_trip(db, OTHER)
    seed_stop(db, trip, 1, 0)
    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 404
    assert resp.json() == {"error": {"code": "not_found", "message": "Not found"}}
    assert [table for table, _ in db.log] == ["trips"]
    assert ("eq", "user_id", USER) in db.log[0][1]
    assert db.rpc_calls == []


async def test_missing_trip_is_indistinguishable_from_foreign(db):
    foreign = seed_trip(db, OTHER)
    missing = await post("/trips/itinerary", {"trip_id": uid()})
    other = await post("/trips/itinerary", {"trip_id": foreign["id"]})
    assert (missing.status_code, missing.json()) == (other.status_code, other.json())


# ---- itinerary: projection + documented defaults ----

async def test_owner_itinerary_projection_and_defaults(db):
    trip = seed_trip(db)
    day1 = next(d for d in db.db["trip_days"] if d["trip_id"] == trip["id"] and d["day_number"] == 1)
    stop, place = seed_stop(db, trip, 1, 0)
    db.add("transport_legs", leg_row(trip["id"], 0, trip_day_id=day1["id"], from_place_id=place["id"]))
    off_trip = db.add("places", place_row(name="Ichiran", place_type="restaurant"))
    db.add("restaurant_suggestions", restaurant_row(
        trip["id"], restaurant_place_id=off_trip["id"], near_place_id=place["id"]))
    db.add("hotel_suggestions", hotel_row(trip["id"]))

    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert_itinerary_shape(data)
    b = data["bundle"]

    assert b["events"] == []
    assert b["trip"]["tradeoffs"] == {"notes": [], "comparisons": []}
    assert b["trip"]["preference_sources"] == ["explicit", "memory"]
    assert all(p["place"]["source_summary"] == {} for p in b["places"])
    assert all(p["source_summary"] == {} for p in b["suggestion_places"])
    assert all(d["weather_payload"] == {} for d in b["days"])
    assert all(leg["route_geometry"] is None for leg in b["transport_legs"])
    assert all(r["evidence_json"] == {} and r["preference_match_json"] == {} for r in b["restaurants"])
    assert all(h["preference_match_json"] == {} and h["place_durations"] == {} for h in b["hotels"])

    hotel = b["hotels"][0]
    assert hotel["price_snapshot"] == {"currency": "USD", "pricePerNight": 180, "totalPrice": 360}
    assert (hotel["guest_rating"], hotel["refundable"]) == (8.6, True)
    assert hotel["free_cancellation_until"] == "2026-09-28T00:00:00Z"
    assert "SECRET" not in resp.text
    assert "travala_result_json" not in resp.text and "travala_session_id" not in resp.text

    # suggestion_places: the off-trip restaurant place only; the on-trip one is not duplicated.
    assert [p["id"] for p in b["suggestion_places"]] == [off_trip["id"]]
    assert data["saved_day_numbers"] == [1, 2, 3]
    assert not any(data["truncated"].values())
    zod_check([("itineraryResponseSchema", data)])


async def test_hotel_blob_with_unusable_values_projects_nulls(db):
    trip = seed_trip(db)
    db.add("hotel_suggestions", hotel_row(
        trip["id"], rank=None, is_recommended=False, geo_status="unresolved", lat=None, lng=None,
        price_snapshot={"currency": 5, "pricePerNight": "180"},
        travala_result_json={"rating": True, "refundability": 3, "cancellation": "soon"}))
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    hotel = data["bundle"]["hotels"][0]
    assert hotel["price_snapshot"] == {}
    assert (hotel["guest_rating"], hotel["refundable"], hotel["free_cancellation_until"]) == (None, None, None)


# ---- itinerary: covers, attribution, inspiration synthesis ----

async def test_covers_and_reel_attribution_via_owner_rpc(db):
    reel_a = "https://www.instagram.com/reel/AAA111"
    reel_b = "https://www.instagram.com/reel/BBB222"
    trip = seed_trip(db)
    extracted, place_x = seed_stop(db, trip, 1, 0)
    requested, place_y = seed_stop(db, trip, 1, 1, source_type="user_requested")
    recorded, place_z = seed_stop(db, trip, 2, 0)
    recorded["evidence_json"]["source_reel_url"] = "https://www.instagram.com/reel/KEEP"
    db.add("generation_events", {"id": uid(), "trip_id": trip["id"], "stage": "create_trip",
                                 "created_at": instant(), "payload": {"reel_urls": [f"{reel_a}/?igsh=x"]}})
    mention = lambda place: {"place_id": place["id"], "source_reel_url": reel_a, "name": "n"}  # noqa: E731
    db.add("_cards", card(USER, reel_a, thumbnail_url="https://cdn.example/a.jpg",
                          places=[mention(place_x), mention(place_y), mention(place_z)]))
    db.add("_cards", card(USER, reel_b, thumbnail_url="https://cdn.example/b.jpg",
                          places=[{"place_id": place_x["id"], "source_reel_url": reel_b}]))
    db.add("_cards", card(OTHER, reel_a, thumbnail_url="https://cdn.example/other.jpg"))

    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    by_id = {p["id"]: p for p in data["bundle"]["places"]}
    assert by_id[extracted["id"]]["evidence_json"]["source_reel_url"] == reel_a     # backfilled
    assert by_id[requested["id"]]["evidence_json"]["source_reel_url"] is None       # never relabelled
    assert by_id[recorded["id"]]["evidence_json"]["source_reel_url"].endswith("KEEP")  # never overwritten
    assert data["bundle"]["inspiration"] == [{
        "id": "derived-reel-0", "trip_id": trip["id"], "item_type": "reel_url", "source": "manual_paste",
        "normalized_reel_url": reel_a, "reel_cache_id": None, "requested_place_text": None,
        "resolved_place_id": None, "status": "valid", "thumbnail_url": "https://cdn.example/a.jpg",
    }]
    assert db.rpc_calls == [("saved_reel_cards_for_user",
                             {"p_user_id": USER, "p_limit": 200, "p_after_created": None, "p_after_id": None})]


async def test_library_trip_without_declared_reels_uses_contributing_reels(db):
    reel = "https://www.instagram.com/p/POST1"
    trip = seed_trip(db)
    _, place = seed_stop(db, trip, 1, 0)
    db.add("_cards", card(USER, reel, thumbnail_url="https://cdn.example/p.jpg",
                          places=[{"place_id": place["id"], "source_reel_url": reel}]))
    db.add("_cards", card(USER, "https://www.instagram.com/reel/UNRELATED", thumbnail_url="https://cdn.example/u.jpg"))
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert [(i["normalized_reel_url"], i["thumbnail_url"]) for i in data["bundle"]["inspiration"]] == [
        (reel, "https://cdn.example/p.jpg")]


async def test_inspiration_table_rows_get_covers(db):
    reel = "https://www.instagram.com/reel/TABLE1"
    trip = seed_trip(db)
    db.add("trip_inspiration_items", {
        "id": uid(), "trip_id": trip["id"], "item_type": "reel_url", "source": "clipboard",
        "normalized_reel_url": reel + "/", "reel_cache_id": None, "requested_place_text": None,
        "resolved_place_id": None, "status": "valid", "created_at": instant(), "updated_at": instant()})
    db.add("_cards", card(USER, reel, thumbnail_url="https://cdn.example/t.jpg"))
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert data["bundle"]["inspiration"][0]["thumbnail_url"] == "https://cdn.example/t.jpg"


async def test_cover_enrichment_failure_still_renders(db):
    trip = seed_trip(db)
    seed_stop(db, trip, 1, 0)
    db.fail_rpcs.add("saved_reel_cards_for_user")
    db.fail_tables.add("generation_events")
    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 200
    assert resp.json()["bundle"]["inspiration"] == []


# ---- itinerary: text caps and URLs ----

async def test_text_caps_and_url_rules(db):
    trip = seed_trip(db, title="T" * 400, summary="S" * 400)
    exact_url = "https://example.com/" + "a" * (512 - len("https://example.com/"))
    stop, _ = seed_stop(db, trip, 1, 0, place={"name": "旅" * 300})
    stop["evidence_json"].update(source_url="https://example.com/" + "b" * 600,
                                 quote="q" * 500, quotes=["x"] * 9)
    db.add("restaurant_suggestions", restaurant_row(trip["id"], source_url="javascript:alert(1)"))
    db.add("transport_legs", leg_row(trip["id"], 0, warning="w" * 500))
    db.add("restaurant_suggestions", restaurant_row(trip["id"], source_url=exact_url))

    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    b = data["bundle"]
    assert len(b["trip"]["title"]) == 160 and b["trip"]["title"].endswith("…")
    assert len(b["trip"]["summary"]) == 280
    stop_out = b["places"][0]
    assert len(stop_out["place"]["name"]) == 120 and stop_out["place"]["name"].endswith("…")
    assert stop_out["evidence_json"]["source_url"] is None          # overlength URL: null, never cut
    assert len(stop_out["evidence_json"]["quote"]) == 280
    assert len(stop_out["evidence_json"]["quotes"]) == 5
    assert data["truncated"]["quotes"] is True                      # dropped quotes are reported
    assert len(b["transport_legs"][0]["warning"]) == 160
    assert sorted(r["source_url"] or "" for r in b["restaurants"]) == ["", exact_url]
    zod_check([("itineraryResponseSchema", data)])


# ---- itinerary: SQL limits, semantic ordering, flags ----

def _reversed_ids(count: int) -> list[str]:
    """UUIDs whose sort order is the REVERSE of their index."""
    return sorted((uid() for _ in range(count)), reverse=True)


async def test_semantic_ordering_survives_sql_limits_with_reversed_uuids(db):
    trip = seed_trip(db, days=())
    for n, day_id in zip(range(1, 36), _reversed_ids(35)):
        db.add("trip_days", day_row(trip["id"], n, id=day_id))
    for rank, hotel_id in zip(range(1, 13), _reversed_ids(12)):
        db.add("hotel_suggestions", hotel_row(trip["id"], id=hotel_id, rank=rank, is_recommended=rank == 1))
    db.add("hotel_suggestions", hotel_row(trip["id"], id="00000000-0000-4000-8000-000000000000",
                                          rank=None, is_recommended=False))

    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert [d["day_number"] for d in data["bundle"]["days"]] == list(range(1, 31))
    assert data["saved_day_numbers"] == list(range(1, 36))
    assert [h["rank"] for h in data["bundle"]["hotels"]] == list(range(1, 11))   # rank-1 kept, nulls last
    assert data["truncated"]["days"] and data["truncated"]["hotels"]


def _seed_over_limit(db, trip, what: str) -> None:
    if what == "stops":
        for i in range(201):
            seed_stop(db, trip, None if i % 2 else 1, i)
    elif what == "legs":
        for i in range(301):
            db.add("transport_legs", leg_row(trip["id"], i))
    elif what == "restaurants":
        for _ in range(61):
            db.add("restaurant_suggestions", restaurant_row(trip["id"], summary="s"))
    else:
        for _ in range(61):
            db.add("trip_inspiration_items", {
                "id": uid(), "trip_id": trip["id"], "item_type": "requested_place", "source": "manual_input",
                "normalized_reel_url": None, "reel_cache_id": None, "requested_place_text": "Tokyo Tower",
                "resolved_place_id": None, "status": "resolved"})


@pytest.mark.parametrize("flag, key, cap", [
    ("stops", "places", 200), ("legs", "transport_legs", 300),
    ("restaurants", "restaurants", 60), ("inspiration", "inspiration", 60),
])
async def test_every_sql_limit_sets_its_flag(db, flag, key, cap):
    # One table per case, so no case needs the byte budget (which would blur which rule acted).
    trip = seed_trip(db, days=(1,))
    _seed_over_limit(db, trip, flag)
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert len(data["bundle"][key]) == cap
    assert [name for name, on in data["truncated"].items() if on] == [flag]
    if flag == "stops":   # day_number NULLS LAST, then sort_order
        day_numbers = [p["day_number"] for p in data["bundle"]["places"]]
        assert day_numbers == sorted(day_numbers, key=lambda n: (n is None, n))


async def test_noncontiguous_day_numbers_are_reported_for_a_missing_day(db):
    trip = seed_trip(db, days=(1, 2, 4))
    resp = await post("/trips/itinerary", {"trip_id": trip["id"], "day": 3})
    assert resp.status_code == 200
    assert resp.json()["saved_day_numbers"] == [1, 2, 4]


# ---- itinerary: byte budget through the route ----

BIG_NAME = "旅" * 120                       # 360 bytes, at the name cap
BIG_URL = "https://example.com/" + "u" * (512 - len("https://example.com/"))


def _seed_heavy_day(db, trip, day_number: int, stops: int, day_id=None):
    day = next((d for d in db.db.get("trip_days", []) if d["trip_id"] == trip["id"] and d["day_number"] == day_number), None)
    if day is None:
        day = db.add("trip_days", day_row(trip["id"], day_number, id=day_id or uid()))
    placed = []
    for i in range(stops):
        stop, place = seed_stop(
            db, trip, day_number, i,
            place={"name": BIG_NAME, "name_local": BIG_NAME, "city": BIG_NAME, "area": BIG_NAME,
                   "country": BIG_NAME, "aliases": [BIG_NAME] * 10},
            evidence_json={"confidence": 0.5, "source_url": BIG_URL, "source_reel_url": BIG_URL,
                           "quote": None, "quotes": [], "rationale": None, "evidence_kind": "reel_quote"})
        placed.append(place)
    for a, b_ in zip(placed, placed[1:]):
        db.add("transport_legs", leg_row(trip["id"], len(db.db.get("transport_legs", [])),
                                         trip_day_id=day["id"], from_place_id=a["id"], to_place_id=b_["id"]))
    near = placed[0]["id"] if placed else None
    off = db.add("places", place_row(name=f"Off {day_number}"))
    db.add("restaurant_suggestions", restaurant_row(
        trip["id"], trip_day_id=day["id"], restaurant_place_id=off["id"], near_place_id=near))
    return day


def _assert_integrity(bundle: dict) -> None:
    place_ids = {p["place_id"] for p in bundle["places"]}
    day_ids = {d["id"] for d in bundle["days"]}
    suggestion_ids = {p["id"] for p in bundle["suggestion_places"]}
    for leg in bundle["transport_legs"]:
        assert leg["trip_day_id"] in day_ids | {None}
        assert {leg["from_place_id"], leg["to_place_id"]} <= place_ids | {None}
    for r in bundle["restaurants"]:
        assert r["trip_day_id"] in day_ids | {None}
        assert {r["restaurant_place_id"], r["near_place_id"]} <= place_ids | suggestion_ids | {None}
    referenced = {r[k] for r in bundle["restaurants"] for k in ("restaurant_place_id", "near_place_id")}
    assert suggestion_ids <= referenced
    assert {p["day_number"] for p in bundle["places"]} <= {d["day_number"] for d in bundle["days"]}


async def test_counterexample_200_stops_hits_the_terminal_day_rule(db):
    trip = seed_trip(db, days=())
    for n in range(1, 11):
        _seed_heavy_day(db, trip, n, 20)
    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 200
    data = resp.json()
    kept = [d["day_number"] for d in data["bundle"]["days"]]
    assert kept == list(range(1, len(kept) + 1)) and len(kept) < 10   # dropped from the END
    assert data["truncated"]["days"] and data["truncated"]["stops"] and data["truncated"]["legs"]
    assert data["saved_day_numbers"] == list(range(1, 11))
    _assert_integrity(data["bundle"])
    zod_check([("itineraryResponseSchema", data)])


async def test_requested_day_is_never_dropped(db):
    trip = seed_trip(db, days=())
    for n in range(1, 11):
        _seed_heavy_day(db, trip, n, 20)
    data = (await post("/trips/itinerary", {"trip_id": trip["id"], "day": 10})).json()
    kept = [d["day_number"] for d in data["bundle"]["days"]]
    assert 10 in kept and data["truncated"]["days"]
    assert any(p["day_number"] == 10 for p in data["bundle"]["places"])
    _assert_integrity(data["bundle"])


async def test_single_day_that_cannot_fit_is_413_too_large(db):
    trip = seed_trip(db, days=())
    _seed_heavy_day(db, trip, 1, 200)
    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 413
    assert resp.json() == {"error": {"code": "too_large", "message": "Result too large"}}


async def test_no_days_bundle_too_large_with_maximal_multibyte_warnings(db):
    trip = seed_trip(db, days=())
    for i in range(300):
        db.add("transport_legs", leg_row(trip["id"], i, warning="𝄞" * 400))   # 4-byte chars, capped at 160
    resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 413


# ---- itinerary: combined caps keep the requested day whole (review C3) ----

def _assert_no_dangling(bundle: dict) -> None:
    place_ids = {p["place_id"] for p in bundle["places"]}
    day_ids = {d["id"] for d in bundle["days"]}
    resolvable = place_ids | {p["id"] for p in bundle["suggestion_places"]}
    for leg in bundle["transport_legs"]:
        assert leg["trip_day_id"] in day_ids | {None}
        assert {leg["from_place_id"], leg["to_place_id"]} <= place_ids | {None}
    for r in bundle["restaurants"]:
        assert r["trip_day_id"] in day_ids | {None}
        assert {r["restaurant_place_id"], r["near_place_id"]} <= resolvable | {None}


def _seed_combined_cap_repro(db):
    """201 Day-1 stops + 1 Day-2 stop + a Day-2 leg (and restaurant) referencing an omitted stop."""
    trip = seed_trip(db, days=(1, 2))
    day2 = next(d for d in db.db["trip_days"] if d["trip_id"] == trip["id"] and d["day_number"] == 2)
    day1_places = [seed_stop(db, trip, 1, i)[1] for i in range(201)]
    day2_stop, day2_place = seed_stop(db, trip, 2, 0)
    omitted = day1_places[-1]                       # sort_order 200: beyond the 200-stop cap
    leg = db.add("transport_legs", leg_row(trip["id"], 0, trip_day_id=day2["id"],
                                           from_place_id=day2_place["id"], to_place_id=omitted["id"]))
    kept_leg = db.add("transport_legs", leg_row(trip["id"], 1, trip_day_id=day2["id"],
                                                from_place_id=day2_place["id"]))
    dangling_restaurant = db.add("restaurant_suggestions", restaurant_row(
        trip["id"], trip_day_id=day2["id"], near_place_id=omitted["id"]))
    return trip, day2_stop, leg, kept_leg, dangling_restaurant


async def test_combined_caps_never_empty_the_requested_day_or_dangle(db):
    trip, day2_stop, leg, kept_leg, dangling = _seed_combined_cap_repro(db)
    resp = await post("/trips/itinerary", {"trip_id": trip["id"], "day": 2})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    b = data["bundle"]
    assert [p["id"] for p in b["places"] if p["day_number"] == 2] == [day2_stop["id"]]
    assert len(b["places"]) == 200                  # the cap still holds, Day 1 gave way
    leg_ids = {x["id"] for x in b["transport_legs"]}
    assert kept_leg["id"] in leg_ids and leg["id"] not in leg_ids
    # The restaurant's near place was capped off the stop list, so it is fetched as a suggestion
    # place (the browser's rule) and still resolves: kept, not dangling.
    assert dangling["id"] in {r["id"] for r in b["restaurants"]}
    assert dangling["near_place_id"] in {p["id"] for p in b["suggestion_places"]}
    assert data["truncated"]["stops"] and data["truncated"]["legs"]
    _assert_no_dangling(b)
    zod_check([("itineraryResponseSchema", data)])


async def test_without_a_requested_day_capped_stops_leave_no_dangling_leg(db):
    trip, day2_stop, leg, kept_leg, _ = _seed_combined_cap_repro(db)
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    b = data["bundle"]
    assert day2_stop["id"] not in {p["id"] for p in b["places"]}   # capped away by global order
    assert b["transport_legs"] == []                                  # both legs referenced it
    assert data["truncated"]["stops"] and data["truncated"]["legs"]
    _assert_no_dangling(b)


async def test_protected_rows_crowding_out_an_exactly_full_window_are_flagged(db):
    # 200 Day-1 stops fill the cap exactly; the protected Day-2 stop must displace one of them
    # (not be displaced), and the displaced stop must be reported.
    trip = seed_trip(db, days=(1, 2))
    for i in range(200):
        seed_stop(db, trip, 1, i)
    day2_stop, _ = seed_stop(db, trip, 2, 0)
    data = (await post("/trips/itinerary", {"trip_id": trip["id"], "day": 2})).json()
    assert len(data["bundle"]["places"]) == 200
    assert day2_stop["id"] in {p["id"] for p in data["bundle"]["places"]}
    assert data["truncated"]["stops"]


async def test_requested_day_over_the_stop_cap_is_an_honest_413(db):
    trip = seed_trip(db, days=(1, 2))
    seed_stop(db, trip, 1, 0)
    for i in range(201):
        seed_stop(db, trip, 2, i)
    resp = await post("/trips/itinerary", {"trip_id": trip["id"], "day": 2})
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "too_large"
    # Without a requested day the same trip is a flagged partial result, not an error.
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert data["truncated"]["stops"]


async def test_requested_day_legs_over_the_cap_are_flagged(db):
    trip = seed_trip(db, days=(1, 2))
    day2 = next(d for d in db.db["trip_days"] if d["trip_id"] == trip["id"] and d["day_number"] == 2)
    for i in range(301):
        db.add("transport_legs", leg_row(trip["id"], i, trip_day_id=day2["id"]))
    data = (await post("/trips/itinerary", {"trip_id": trip["id"], "day": 2})).json()
    assert len(data["bundle"]["transport_legs"]) == 300 and data["truncated"]["legs"]


# ---- 367-day boundary (review C5): inclusive dates, a 366-day difference ----

async def test_a_367_day_trip_reports_every_day(db):
    trip = seed_trip(db, days=range(1, 368))
    data = (await post("/trips/itinerary", {"trip_id": trip["id"]})).json()
    assert data["saved_day_numbers"] == list(range(1, 368))
    assert data["truncated"]["days"] and len(data["bundle"]["days"]) == 30
    page = (await post("/trips/list", {"limit": 1})).json()
    assert page["trips"][0]["day_count"] == 367
    zod_check([("itineraryResponseSchema", data)])


# ---- trips/list ----

async def test_trips_list_keyset_with_tied_created_at_covers_every_trip_once(db):
    tied = instant(100)
    trips = [db.add("trips", trip_row(USER, created_at=tied)) for _ in range(5)]
    newest = db.add("trips", trip_row(USER, created_at=instant(200)))
    db.add("trips", trip_row(OTHER, created_at=instant(300)))                # foreign: never listed
    for t in trips:
        db.add("trip_days", day_row(t["id"], 1))

    seen, cursor, pages = [], None, 0
    while True:
        body = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        resp = await post("/trips/list", body)
        assert resp.status_code == 200, resp.text
        page = resp.json()
        zod_check([("tripsPageSchema", page)])
        seen += [t["trip_id"] for t in page["trips"]]
        pages += 1
        cursor = page["next_cursor"]
        if cursor is None:
            break
    expected = [newest["id"]] + sorted((t["id"] for t in trips), reverse=True)
    assert seen == expected and pages == 3


async def test_trips_list_projection_and_day_counts_past_max_rows(db):
    trips = [db.add("trips", trip_row(USER, created_at=instant(i), inferred_destination=None,
                                      destination_hint="Kyoto")) for i in range(50)]
    for t in trips:
        for n in range(1, 31):
            db.add("trip_days", day_row(t["id"], n))                          # 1500 rows > max-rows
    page = (await post("/trips/list", {"limit": 50})).json()
    assert len(page["trips"]) == 50 and page["next_cursor"] is None
    assert {t["day_count"] for t in page["trips"]} == {30}
    first = page["trips"][0]
    assert set(first) == KEYS["trip_summary"]
    assert first["destination"] == "Kyoto"                                     # hint as fallback


@pytest.mark.parametrize("cursor", [
    "!!!", "a" * 129, "bm90LWpzb24", encode_cursor(instant(), uid()) + "x",
    # well-formed base64url JSON with bad contents:
    "eyJjIjoiMjAyNi0wOS0wMVQxMDowMDowMCIsImkiOiIxIn0",                          # naive instant, bad uuid
    "eyJjIjoiMjAyNi0wOS0wMVQxMDowMDowMCswMDowMCIsImkiOiJ4In0",                   # bad uuid
    "eyJjIjoiMjAyNi0wOS0wMVQxMDowMDowMCswMDowMCIsImkiOiI2ZjkxNzNkYy1hYWU5LTQ3ZjctYjU1ZC0yOTAxYjQ5ZDk1MWQiLCJ4IjoxfQ",  # extra key
])
async def test_malformed_cursor_is_422(db, cursor):
    resp = await post("/trips/list", {"limit": 5, "cursor": cursor})
    assert resp.status_code == 422
    resp = await post("/saved-reels/list", {"limit": 5, "cursor": cursor})
    assert resp.status_code == 422


# ---- saved-reels/list ----

async def test_saved_reels_mapping_and_owner_rpc(db):
    places = [{"place_id": uid(), "name": f"P{i}", "country_name": "Japan" if i else None} for i in range(12)]
    db.add("_cards", card(USER, "https://www.instagram.com/reel/ABC_1", created_at=instant(5), places=places))
    db.add("_cards", card(USER, "https://www.instagram.com/p/POST-2", created_at=instant(4),
                          analysis_status="not_analyzed"))
    db.add("_cards", card(USER, "https://www.tiktok.com/@x/video/1", created_at=instant(3),
                          source_platform="tiktok", analysis_status="failed"))
    db.add("_cards", card(USER, "https://www.instagram.com/stories/x/1", created_at=instant(2)))
    db.add("_cards", card(OTHER, "https://www.instagram.com/reel/FOREIGN", created_at=instant(9)))
    resp = await post("/saved-reels/list", {"limit": 20})
    page = resp.json()
    zod_check([("savedReelsPageSchema", page)])
    got = [(r["kind"], r["shortcode"], r["platform"], r["status"]) for r in page["reels"]]
    assert got == [("reel", "ABC_1", "instagram", "organized"), ("post", "POST-2", "instagram", "not_analyzed"),
                   ("other", None, "tiktok", "failed"), ("other", None, "instagram", "organized")]
    first = page["reels"][0]
    assert set(first) == KEYS["reel"]
    assert first["place_count"] == 12 and len(first["places"]) == 10
    assert first["places"][0] == {"name": "P0", "country_name": None}
    assert "FOREIGN" not in resp.text and "instagram.com" not in resp.text     # no raw URLs
    assert db.rpc_calls[0] == ("saved_reel_cards_for_user",
                               {"p_user_id": USER, "p_limit": 21, "p_after_created": None, "p_after_id": None})


async def test_saved_reels_keyset_with_tied_timestamps(db):
    tied = instant(50)
    cards = [db.add("_cards", card(USER, f"https://www.instagram.com/reel/R{i}", created_at=tied)) for i in range(5)]
    seen, cursor = [], None
    while True:
        page = (await post("/saved-reels/list", {"limit": 2} | ({"cursor": cursor} if cursor else {}))).json()
        seen += [r["reel_id"] for r in page["reels"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert seen == sorted((c["id"] for c in cards), reverse=True)
    assert all(call[1]["p_user_id"] == USER for call in db.rpc_calls)


# ---- request validation (contract.ts listRequestSchema / itineraryRequestSchema, .strict()) ----

@pytest.mark.parametrize("path, body", [
    ("/trips/list", {"limit": 5, "extra": 1}),
    ("/trips/list", {"limit": 0}),
    ("/trips/list", {"limit": 51}),
    ("/trips/list", {"limit": "5"}),
    ("/trips/list", {"limit": True}),
    ("/trips/list", {"limit": 5, "cursor": None}),
    ("/trips/list", {"limit": 5, "cursor": ""}),
    ("/trips/list", {}),
    ("/saved-reels/list", {"limit": 5, "user_id": USER}),
    ("/trips/itinerary", {"trip_id": "not-a-uuid"}),
    ("/trips/itinerary", {"trip_id": "11111111-1111-1111-1111-111111111111"}),   # not RFC 9562
    ("/trips/itinerary", {"trip_id": uid(), "day": 0}),
    ("/trips/itinerary", {"trip_id": uid(), "day": 31}),
    ("/trips/itinerary", {"trip_id": uid(), "day": None}),
    ("/trips/itinerary", {"trip_id": uid(), "day": 1.5}),
    ("/trips/itinerary", {"trip_id": uid(), "user_id": USER}),
])
async def test_invalid_request_bodies_are_422(db, path, body):
    resp = await post(path, body)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_routes_are_post_only(db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as c:
        resp = await c.get("/internal/mcp/v1/trips/list")
    assert resp.status_code == 405


# ---- failures stay sanitized ----

async def test_store_failure_is_503_without_leaking(db, caplog):
    trip = seed_trip(db)
    db.fail_tables.add("trip_places")
    with caplog.at_level(logging.DEBUG):
        resp = await post("/trips/itinerary", {"trip_id": trip["id"]})
    assert resp.status_code == 503
    assert resp.json() == {"error": {"code": "mcp_unavailable", "message": "Service temporarily unavailable"}}
    assert "SENTINEL" not in resp.text and "SENTINEL" not in caplog.text


async def test_logs_carry_no_user_content_or_sub(db, caplog):
    trip = seed_trip(db)
    seed_stop(db, trip, 1, 0, place={"name": "SENTINEL-PLACE"})
    with caplog.at_level(logging.DEBUG):
        await post("/trips/itinerary", {"trip_id": trip["id"]})
        await post("/trips/list", {"limit": 5})
    assert "SENTINEL-PLACE" not in caplog.text
    assert "Go early" not in caplog.text
    assert USER not in caplog.text
    assert "mcp_read endpoint=trips/itinerary outcome=ok" in caplog.text


async def test_reads_share_one_per_user_rate_limit(db, monkeypatch):
    # The limit string is bound at decoration time; prove the shared scope with the real value.
    statuses = []
    for i in range(31):
        path = "/trips/list" if i % 2 else "/saved-reels/list"
        statuses.append((await post(path, {"limit": 1})).status_code)
    assert statuses[:30] == [200] * 30 and statuses[30] == 429
