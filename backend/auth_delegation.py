"""Delegation-token verifier for the internal MCP read router (docs/mcp-app/PLAN.md §2.3).

The Next.js MCP gateway verifies the user's OAuth token, then calls /internal/mcp/v1/* with a
short-lived HS256 token it signs with MCP_DELEGATION_SECRET. This module is the ONLY place that
key is accepted, and `require_delegation` is mounted ONLY on that router: every other route keeps
`auth.get_current_user_id`, which accepts ES256/RS256 alone, so a delegation token cannot reach a
write, generation or deletion route (test_auth_delegation.py pins that).

Checks, in order (all fail closed):
  1. config — the secret decodes to >= 48 bytes and MCP_BACKEND_ORIGIN is a bare origin; else 503.
  2. signature + claims — HS256 only; iss, string aud == origin + request path, scope, UUID
     sub/client_id/jti, 0 < exp - iat <= 60, iat <= now + 5, exp > now - 5; else 401.
  3. body hash — `bh` == base64url(SHA-256(raw body)), constant-time; else 401.
  4. durable replay — the jti is INSERTed into public.mcp_delegation_jti; a unique violation is
     401 `replayed`, any other store error is 503. Survives restarts and instances (F11).
  5. identity — request.state.user_id = sub, so the slowapi per-user key applies.

The outer bound `exp <= mcp_token.exp` is the gateway's job: only it holds the MCP token.

Never logs the token, the body or a claim; the only identity in a log line is `sub_hash`, the
first 8 hex chars of SHA-256(sub) (PLAN §3 requirement 8).
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import logging
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from jose import JWTError, jwt

from supabase_client import get_supabase_client

logger = logging.getLogger("astrail.mcp.delegation")

DELEGATION_ISSUER = "astrail-mcp-gateway"
DELEGATION_SCOPE = "mcp:read"
MAX_LIFETIME_S = 60
CLOCK_SKEW_S = 5
MIN_SECRET_BYTES = 48
PRUNE_PROBABILITY = 0.01
PRUNE_MAX_ROWS = 100
JTI_TABLE = "mcp_delegation_jti"
PRUNE_RPC = "mcp_delegation_jti_prune"

# Same shape as the gateway's UUID_RE (frontend/lib/mcp/config.ts): these are claims the
# gateway already verified, so the backend mirrors its acceptance rather than tightening it.
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_BODY_HASH_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_DEFAULT_PORTS = {"http": 80, "https": 443}

_UNAVAILABLE = {"code": "mcp_unavailable", "message": "Service temporarily unavailable"}
_UNAUTHORIZED = {"code": "unauthorized", "message": "Request could not be verified"}
_REPLAYED = {"code": "replayed", "message": "Request could not be verified"}


@dataclass(frozen=True)
class DelegationConfig:
    secret: bytes
    origin: str


def _is_production(env) -> bool:
    # Render sets RENDER=true on every service it runs; nothing else in the backend
    # distinguishes production (SENTRY_ENVIRONMENT defaults to "production" even locally).
    return bool((env.get("RENDER") or "").strip())


def parse_backend_origin(raw: str | None, *, production: bool) -> str | None:
    """A bare origin, normalized exactly like the gateway's `new URL(raw).origin`.

    HTTPS always; plain http only for a loopback host outside production. No credentials,
    path (a lone "/" is allowed, as URL parsing yields it), query or fragment."""
    value = (raw or "").strip()
    if not value:
        return None
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    host = parts.hostname
    if not host or parts.username or parts.password or parts.query or parts.fragment:
        return None
    if parts.path not in ("", "/") or "#" in value or "?" in value:
        return None
    if scheme == "http":
        if production or host not in _LOOPBACK_HOSTS:
            return None
    elif scheme != "https":
        return None
    netloc = f"[{host}]" if ":" in host else host
    if port is not None and port != _DEFAULT_PORTS[scheme]:
        netloc = f"{netloc}:{port}"
    return f"{scheme}://{netloc}"


def decode_secret(raw: str | None) -> bytes | None:
    """Base64 (standard or url-safe; line breaks from `openssl rand -base64 64` ignored)."""
    compact = "".join((raw or "").split())
    if not compact:
        return None
    compact = compact.replace("-", "+").replace("_", "/")
    compact += "=" * (-len(compact) % 4)
    try:
        secret = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError):
        return None
    return secret if len(secret) >= MIN_SECRET_BYTES else None


def load_config(env=None) -> DelegationConfig | None:
    """None when either value is missing or malformed — the caller answers 503."""
    env = os.environ if env is None else env
    secret = decode_secret(env.get("MCP_DELEGATION_SECRET"))
    origin = parse_backend_origin(env.get("MCP_BACKEND_ORIGIN"), production=_is_production(env))
    if secret is None or origin is None:
        return None
    return DelegationConfig(secret=secret, origin=origin)


def body_hash(body: bytes) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b"=").decode("ascii")


def sub_hash(sub: str) -> str:
    return hashlib.sha256(sub.encode("utf-8")).hexdigest()[:8]


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_uuid(value) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value))


def _decode_claims(token: str, secret: bytes) -> dict:
    """Signature only. Every claim is re-checked by `_check_claims` — python-jose accepts an
    `aud` LIST containing the audience, and the plan requires a string."""
    try:
        if jwt.get_unverified_header(token).get("alg") != "HS256":
            raise _unauthorized("bad_alg")
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={
                "verify_aud": False, "verify_iss": False, "verify_sub": False,
                "verify_jti": False, "verify_iat": False, "verify_exp": False,
                "verify_nbf": False, "verify_at_hash": False,
            },
        )
    except JWTError:
        raise _unauthorized("bad_signature") from None
    if not isinstance(claims, dict):
        raise _unauthorized("bad_claims")
    return claims


def _check_claims(claims: dict, *, expected_aud: str, now: float) -> None:
    aud = claims.get("aud")
    if claims.get("iss") != DELEGATION_ISSUER:
        raise _unauthorized("bad_iss")
    if not isinstance(aud, str) or aud != expected_aud:
        raise _unauthorized("bad_aud")
    if claims.get("scope") != DELEGATION_SCOPE:
        raise _unauthorized("bad_scope")
    if not all(_is_uuid(claims.get(name)) for name in ("sub", "client_id", "jti")):
        raise _unauthorized("bad_identity")
    bh = claims.get("bh")
    if not isinstance(bh, str) or not _BODY_HASH_RE.match(bh):
        raise _unauthorized("bad_bh")
    iat, exp = claims.get("iat"), claims.get("exp")
    if not (_is_int(iat) and _is_int(exp)):   # Python ints are always finite; floats/bools refused
        raise _unauthorized("bad_times")
    if not 0 < exp - iat <= MAX_LIFETIME_S:
        raise _unauthorized("bad_lifetime")
    if iat > now + CLOCK_SKEW_S or exp <= now - CLOCK_SKEW_S:
        raise _unauthorized("expired")


def _unauthorized(reason: str) -> HTTPException:
    logger.info("mcp_delegation_rejected reason=%s", reason)
    return HTTPException(status_code=401, detail=_UNAUTHORIZED)


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        raise _unauthorized("missing_bearer")
    token = header.removeprefix("Bearer ").strip()
    if not token:
        raise _unauthorized("missing_bearer")
    return token


def should_prune() -> bool:
    """Module-level so tests can force the ~1% branch deterministically."""
    return random.random() < PRUNE_PROBABILITY


async def _consume_jti(client, jti: str, exp: int, sub: str) -> None:
    """Durable single-use. The insert IS the replay check: a unique violation means seen."""
    from postgrest.exceptions import APIError

    expires_at = datetime.fromtimestamp(exp + CLOCK_SKEW_S, tz=timezone.utc).isoformat()
    try:
        await client.table(JTI_TABLE).insert({"jti": jti, "expires_at": expires_at}).execute()
    except APIError as exc:
        if getattr(exc, "code", None) == "23505":
            logger.warning("mcp_delegation_replayed sub_hash=%s", sub_hash(sub))
            raise HTTPException(status_code=401, detail=_REPLAYED) from None
        logger.error("mcp_delegation_store_error type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=_UNAVAILABLE) from None
    except Exception as exc:  # noqa: BLE001 — any store failure fails closed, never open
        logger.error("mcp_delegation_store_error type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=_UNAVAILABLE) from None


async def _maybe_prune(client) -> None:
    """Best-effort cleanup of EXPIRED rows. A failure is logged and never affects the request —
    in particular it is never mistaken for a replay."""
    if not should_prune():
        return
    try:
        await client.rpc(PRUNE_RPC, {"p_max": PRUNE_MAX_ROWS}).execute()
    except Exception as exc:  # noqa: BLE001 — cleanup is optional by design
        logger.warning("mcp_delegation_prune_failed type=%s", type(exc).__name__)


async def require_delegation(request: Request) -> str:
    """FastAPI dependency for /internal/mcp/v1/* ONLY. Returns the delegated user id (`sub`)."""
    config = load_config()
    if config is None:
        logger.error("mcp_delegation_misconfigured")
        raise HTTPException(status_code=503, detail=_UNAVAILABLE)

    token = _bearer(request)
    claims = _decode_claims(token, config.secret)
    _check_claims(claims, expected_aud=config.origin + request.url.path, now=time.time())

    expected_bh = body_hash(await request.body())
    if not hmac.compare_digest(claims["bh"].encode("ascii"), expected_bh.encode("ascii")):
        raise _unauthorized("body_hash_mismatch")

    sub = claims["sub"]
    try:
        client = await get_supabase_client()
    except Exception as exc:  # noqa: BLE001 — no store means no replay check: fail closed
        logger.error("mcp_delegation_store_error type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=_UNAVAILABLE) from None
    await _consume_jti(client, claims["jti"], claims["exp"], sub)
    await _maybe_prune(client)

    request.state.user_id = sub
    return sub
