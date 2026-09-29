"""mcp_budget.fit_to_budget, one stage at a time (PLAN §5.2, §7.2 "force each stage independently").

A real response is built through mcp_reads.read_itinerary on the fake store, then fitted
against a budget chosen to be EXACTLY the size one stage produces — so each test proves that
stage runs, runs in order, and stops as soon as the result fits. Every reduced response must
still validate against the Pydantic mirror and, where node + zod are installed, the real
contract.ts schema.
"""
import copy
import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

import mcp_budget  # noqa: E402
from mcp_budget import BundleTooLarge, fit_to_budget, serialized_size  # noqa: E402
from mcp_reads import read_itinerary  # noqa: E402
from mcp_test_support import (  # noqa: E402
    FakeSupabase, card, day_row, leg_row, place_row, restaurant_row, stop_row, trip_row, uid,
)
from models.mcp import McpItineraryResponse  # noqa: E402
from test_mcp_read import zod_check  # noqa: E402

USER = uid()
REEL = "https://www.instagram.com/reel/BUDGET1"


async def _response() -> dict:
    db = FakeSupabase()
    trip = db.add("trips", trip_row(USER))
    days = {n: db.add("trip_days", day_row(trip["id"], n)) for n in (1, 2, 3)}
    places = []
    for n in (1, 2, 3):
        for i in range(2):
            place = db.add("places", place_row(name=f"Stop {n}.{i}"))
            db.add("trip_places", stop_row(trip["id"], place["id"], n, i))
            places.append((n, place))
    unscheduled = db.add("places", place_row(name="Someday"))
    db.add("trip_places", stop_row(trip["id"], unscheduled["id"], None, None))
    for n in (1, 2, 3):
        a, b = [p for d, p in places if d == n]
        db.add("transport_legs", leg_row(trip["id"], n, trip_day_id=days[n]["id"],
                                         from_place_id=a["id"], to_place_id=b["id"]))
        off = db.add("places", place_row(name=f"Eatery {n}"))
        db.add("restaurant_suggestions", restaurant_row(
            trip["id"], trip_day_id=days[n]["id"], restaurant_place_id=off["id"], near_place_id=a["id"]))
    db.add("generation_events", {"id": uid(), "trip_id": trip["id"], "stage": "create_trip",
                                 "created_at": trip["created_at"], "payload": {"reel_urls": [REEL]}})
    db.add("_cards", card(USER, REEL, thumbnail_url="https://cdn.example/c.jpg"))
    return await read_itinerary(db, USER, trip["id"], None)


def _valid(response: dict) -> dict:
    McpItineraryResponse.model_validate(response)
    return response


@pytest.fixture
async def response():
    resp = await _response()
    assert resp["bundle"]["inspiration"], "fixture must carry inspiration for stage 1"
    return resp


async def test_fits_already_is_returned_unchanged(response):
    assert fit_to_budget(response, protected_day=None) == response


async def test_stage1_drops_inspiration_only(response):
    target = mcp_budget._drop_inspiration(response)
    out = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(target)))
    assert out["bundle"]["inspiration"] == [] and out["truncated"]["inspiration"]
    assert all(r["summary"] for r in out["bundle"]["restaurants"])
    assert not out["truncated"]["restaurant_text"]


async def test_stage2_blanks_restaurant_summaries_to_empty_string(response):
    target = mcp_budget._blank_restaurant_text(mcp_budget._drop_inspiration(response))
    out = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(target)))
    assert [r["summary"] for r in out["bundle"]["restaurants"]] == ["", "", ""]
    assert out["truncated"]["restaurant_text"] and not out["truncated"]["quotes"]
    assert all(p["evidence_json"]["quotes"] for p in out["bundle"]["places"])


async def test_stage3_clears_quotes_last_day_first_then_primary_quotes(response):
    base = mcp_budget._blank_restaurant_text(mcp_budget._drop_inspiration(response))
    states = list(mcp_budget._quote_reductions(base))
    # groups: unscheduled, day 3, day 2, day 1 — first `quotes`, then `quote`.
    assert len(states) == 8
    first = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(states[0])))
    by_day = {p["day_number"]: p["evidence_json"] for p in first["bundle"]["places"]}
    assert by_day[None]["quotes"] == [] and by_day[3]["quotes"] == ["Go early"]
    assert first["truncated"]["quotes"]

    second = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(states[1])))
    assert [p["evidence_json"]["quotes"] for p in second["bundle"]["places"] if p["day_number"] == 3] == [[], []]
    assert all(p["evidence_json"]["quotes"] for p in second["bundle"]["places"] if p["day_number"] == 2)

    fifth = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(states[4])))
    assert all(p["evidence_json"]["quotes"] == [] for p in fifth["bundle"]["places"])
    assert [p["evidence_json"]["quote"] for p in fifth["bundle"]["places"] if p["day_number"] is None] == [None]
    assert all(p["evidence_json"]["quote"] for p in fifth["bundle"]["places"] if p["day_number"] == 3)
    zod_check([("itineraryResponseSchema", s) for s in (first, second, fifth)])


async def test_stage4_removes_unscheduled_then_days_from_the_end(response):
    base = list(mcp_budget._quote_reductions(
        mcp_budget._blank_restaurant_text(mcp_budget._drop_inspiration(response))))[-1]
    removals = list(mcp_budget._day_removals(base, None))
    assert len(removals) == 3                        # unscheduled, day 3, day 2 — day 1 is kept
    out = _valid(fit_to_budget(response, protected_day=None, budget=serialized_size(removals[1])))
    b = out["bundle"]
    assert [d["day_number"] for d in b["days"]] == [1, 2]
    assert {p["day_number"] for p in b["places"]} == {1, 2}
    assert len(b["transport_legs"]) == 2 and len(b["restaurants"]) == 2
    assert {p["name"] for p in b["suggestion_places"]} == {"Eatery 1", "Eatery 2"}
    t = out["truncated"]
    assert t["days"] and t["stops"] and t["legs"] and t["restaurants"] and t["suggestion_places"]
    assert out["saved_day_numbers"] == [1, 2, 3]     # the saved trip is unchanged
    zod_check([("itineraryResponseSchema", out)])


async def test_stage4_keeps_the_protected_day(response):
    base = list(mcp_budget._quote_reductions(
        mcp_budget._blank_restaurant_text(mcp_budget._drop_inspiration(response))))[-1]
    last = list(mcp_budget._day_removals(base, 2))[-1]
    out = fit_to_budget(response, protected_day=2, budget=serialized_size(last))
    assert [d["day_number"] for d in out["bundle"]["days"]] == [2]


async def test_stage5_too_large_when_one_day_cannot_fit(response):
    with pytest.raises(BundleTooLarge):
        fit_to_budget(response, protected_day=None, budget=1000)


async def test_fit_never_mutates_its_input(response):
    snapshot = copy.deepcopy(response)
    with pytest.raises(BundleTooLarge):              # walks every stage, then gives up
        fit_to_budget(response, protected_day=None, budget=1000)
    assert response == snapshot


async def test_measured_bytes_are_utf8_not_characters():
    small = {"bundle": {}, "truncated": {}, "s": "旅" * 10}
    assert serialized_size(small) == len(mcp_budget.dumps(small)) + 20


async def test_reconcile_drops_and_flags_unresolvable_legs_and_restaurants(response):
    b = response["bundle"]
    ghost = "00000000-0000-4000-8000-00000000dead"
    bad_leg = {**b["transport_legs"][0], "id": uid(), "to_place_id": ghost}
    bad_day_leg = {**b["transport_legs"][0], "id": uid(), "trip_day_id": ghost}
    bad_restaurant = {**b["restaurants"][0], "id": uid(), "restaurant_place_id": ghost}
    dirty = {**response, "bundle": {**b, "transport_legs": b["transport_legs"] + [bad_leg, bad_day_leg],
                                    "restaurants": b["restaurants"] + [bad_restaurant]}}
    out = _valid(mcp_budget.reconcile(dirty))
    assert out["bundle"]["transport_legs"] == b["transport_legs"]
    assert out["bundle"]["restaurants"] == b["restaurants"]
    assert out["truncated"]["legs"] and out["truncated"]["restaurants"]
    assert mcp_budget.reconcile(response) is response          # already consistent: untouched
