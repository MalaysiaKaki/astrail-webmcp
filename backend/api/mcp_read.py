"""Internal read endpoints for the remote MCP gateway (docs/mcp-app/PLAN.md §4.3).

POST-only, JSON body, under /internal/mcp/v1. Authenticated by `require_delegation` ONLY — never
`get_current_user_id` — so the caller is the Next.js gateway acting for one user, and the user
id comes from the verified delegation `sub`, never from the body.

Failures use the shared error envelope with generic messages: 401/503 from the verifier, 404 for
a missing OR foreign trip (indistinguishable), 413 `too_large` when even one day cannot fit the
byte budget, 422 for a malformed body or cursor, 503 when a store read fails. Logs carry the
endpoint, outcome, latency and `sub_hash` only (PLAN §3 requirement 8).
"""
from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth_delegation import require_delegation, sub_hash
from mcp_budget import BundleTooLarge, dumps
from mcp_reads import InvalidCursor, TripNotFound, list_saved_reels, list_trips, read_itinerary
from models.mcp import (
    McpItineraryRequest, McpItineraryResponse, McpListRequest, McpSavedReelsPage, McpTripsPage,
)
from rate_limit import limiter
from supabase_client import get_supabase_client

logger = logging.getLogger("astrail.mcp.read")

# One shared per-user budget across all three reads. These are cheap owner-scoped DB reads, so
# they sit with SAVE_LIMIT's ceiling rather than BURST_LIMIT's 3/minute (sized for Apify/OpenAI
# spend) — one ChatGPT turn can list, read and render a trip.
MCP_READ_LIMIT: str = os.environ.get("MCP_READ_LIMIT", "30/minute")

router = APIRouter(prefix="/internal/mcp/v1", tags=["mcp"])

_NOT_FOUND = {"code": "not_found", "message": "Not found"}
_TOO_LARGE = {"code": "too_large", "message": "Result too large"}
_BAD_CURSOR = {"code": "validation_error", "message": "Invalid cursor"}
_UNAVAILABLE = {"code": "mcp_unavailable", "message": "Service temporarily unavailable"}


async def _run(endpoint: str, user_id: str, read):
    """Await `read(client)`, mapping every failure to a sanitized envelope and one log line."""
    started = time.monotonic()
    outcome = "ok"
    try:
        client = await get_supabase_client()
        return await read(client)
    except TripNotFound:
        outcome = "not_found"
        raise HTTPException(status_code=404, detail=_NOT_FOUND) from None
    except BundleTooLarge:
        outcome = "too_large"
        raise HTTPException(status_code=413, detail=_TOO_LARGE) from None
    except InvalidCursor:
        outcome = "bad_cursor"
        raise HTTPException(status_code=422, detail=_BAD_CURSOR) from None
    except Exception as exc:  # noqa: BLE001 — never leak a store error or its values
        outcome = f"error:{type(exc).__name__}"
        raise HTTPException(status_code=503, detail=_UNAVAILABLE) from None
    finally:
        logger.info(
            "mcp_read endpoint=%s outcome=%s latency_ms=%d sub_hash=%s",
            endpoint, outcome, (time.monotonic() - started) * 1000, sub_hash(user_id),
        )


@router.post("/trips/list", response_model=McpTripsPage)
@limiter.shared_limit(MCP_READ_LIMIT, scope="mcp_read")
async def mcp_list_trips(
    request: Request,                               # required by slowapi; must be named `request`
    response: Response,                             # REQUIRED with headers_enabled=True
    body: McpListRequest,
    user_id: str = Depends(require_delegation),     # delegation `sub`: the only identity source
) -> McpTripsPage:
    page = await _run("trips/list", user_id,
                      lambda client: list_trips(client, user_id, body.limit, body.cursor))
    return McpTripsPage.model_validate(page)


@router.post("/trips/itinerary", response_model=McpItineraryResponse)
@limiter.shared_limit(MCP_READ_LIMIT, scope="mcp_read")
async def mcp_trip_itinerary(
    request: Request,
    response: Response,
    body: McpItineraryRequest,
    user_id: str = Depends(require_delegation),
) -> Response:
    result = await _run("trips/itinerary", user_id,
                        lambda client: read_itinerary(client, user_id, body.trip_id, body.day))
    # Returned as the exact bytes the byte budget measured (mcp_budget.dumps), not re-serialized.
    return Response(content=dumps(result).encode("utf-8"), media_type="application/json")


@router.post("/saved-reels/list", response_model=McpSavedReelsPage)
@limiter.shared_limit(MCP_READ_LIMIT, scope="mcp_read")
async def mcp_list_saved_reels(
    request: Request,
    response: Response,
    body: McpListRequest,
    user_id: str = Depends(require_delegation),
) -> McpSavedReelsPage:
    page = await _run("saved-reels/list", user_id,
                      lambda client: list_saved_reels(client, user_id, body.limit, body.cursor))
    return McpSavedReelsPage.model_validate(page)
