"""Delegation-token verifier (auth_delegation.py, docs/mcp-app/PLAN.md §2.3 and §7.2).

Drives a probe route guarded by `require_delegation` over ASGI, with an in-memory replay store
that behaves like the unique constraint on public.mcp_delegation_jti: the check-and-insert is
one atomic step, and a duplicate raises PostgREST's 23505. Also proves, against the REAL app,
that a delegation token is refused by every ordinary route (scope isolation) and accepted by
the MCP router end to end.
"""
import asyncio
import base64
import json
import logging
import os
import time
import uuid

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI, Request
from jose import jwt
from postgrest.exceptions import APIError

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

import auth_delegation  # noqa: E402
from api.errors import register_error_handlers  # noqa: E402
from auth_delegation import (  # noqa: E402
    body_hash, decode_secret, load_config, parse_backend_origin, require_delegation,
)

SECRET = os.urandom(64)
SECRET_B64 = base64.b64encode(SECRET).decode()
ORIGIN = "https://api.example.test"
PATH = "/internal/mcp/v1/probe"
SUB = str(uuid.uuid4())
CLIENT_ID = str(uuid.uuid4())
BODY = b'{"limit":5}'
_DROP = object()


class _Result:
    def __init__(self, data):
        self.data = data


class JtiStore:
    """Shared across 'instances': the DB is the single source of replay truth."""

    def __init__(self, *, fail=None, prune_fail=False):
        self.jtis: set[str] = set()
        self.fail = fail
        self.prune_fail = prune_fail
        self.prune_calls: list[dict] = []
        self.inserted: list[dict] = []


class _JtiTable:
    def __init__(self, store: JtiStore):
        self.store = store
        self.row = None

    def insert(self, row):
        self.row = row
        return self

    async def execute(self):
        await asyncio.sleep(0)   # let concurrent requests interleave up to the atomic step
        if self.store.fail is not None:
            raise self.store.fail
        if self.row["jti"] in self.store.jtis:   # check + insert with no await between: atomic
            raise APIError({"code": "23505", "message": "duplicate key value", "details": None, "hint": None})
        self.store.jtis.add(self.row["jti"])
        self.store.inserted.append(self.row)
        return _Result([self.row])


class _Rpc:
    def __init__(self, store, name, params):
        self.store, self.name, self.params = store, name, params

    async def execute(self):
        self.store.prune_calls.append({"name": self.name, **self.params})
        if self.store.prune_fail:
            raise RuntimeError("prune exploded")
        return _Result(0)


class FakeClient:
    def __init__(self, store: JtiStore):
        self.store = store

    def table(self, name):
        assert name == "mcp_delegation_jti", name
        return _JtiTable(self.store)

    def rpc(self, name, params):
        return _Rpc(self.store, name, params)


def _probe_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.post(PATH)
    async def probe(request: Request, user_id: str = Depends(require_delegation)):
        return {"user_id": user_id, "stashed": request.state.user_id}

    @app.post("/internal/mcp/v1/other")
    async def other(user_id: str = Depends(require_delegation)):
        return {"user_id": user_id}

    return app


@pytest.fixture
def store(monkeypatch):
    store = JtiStore()

    async def _client():
        return FakeClient(store)

    monkeypatch.setattr(auth_delegation, "get_supabase_client", _client)
    monkeypatch.setattr(auth_delegation, "should_prune", lambda: False)
    monkeypatch.setenv("MCP_DELEGATION_SECRET", SECRET_B64)
    monkeypatch.setenv("MCP_BACKEND_ORIGIN", ORIGIN)
    monkeypatch.delenv("RENDER", raising=False)
    return store


def mint(body: bytes = BODY, *, path: str = PATH, key=SECRET, algorithm="HS256", headers=None, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": "astrail-mcp-gateway",
        "aud": ORIGIN + path,
        "sub": SUB,
        "client_id": CLIENT_ID,
        "scope": "mcp:read",
        "iat": now,
        "exp": now + 30,
        "jti": str(uuid.uuid4()),
        "bh": body_hash(body),
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not _DROP}
    return jwt.encode(claims, key, algorithm=algorithm, headers=headers)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


async def _post(app, token: str | None, body: bytes = BODY, path: str = PATH) -> httpx.Response:
    headers = {"content-type": "application/json"}
    if token is not None:
        headers["authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        return await c.post(path, content=body, headers=headers)


# ---- config ----

@pytest.mark.parametrize("raw, production, expected", [
    ("https://api.example.test", False, "https://api.example.test"),
    ("https://api.example.test/", True, "https://api.example.test"),
    ("https://API.Example.test:443", True, "https://api.example.test"),
    ("https://api.example.test:8443", True, "https://api.example.test:8443"),
    ("http://localhost:8000", False, "http://localhost:8000"),
    ("http://127.0.0.1:8000", False, "http://127.0.0.1:8000"),
    ("http://localhost:8000", True, None),
    ("http://api.example.test", False, None),
    ("https://api.example.test/internal", False, None),
    ("https://api.example.test?x=1", False, None),
    ("https://api.example.test#frag", False, None),
    ("https://user:pw@api.example.test", False, None),
    ("ftp://api.example.test", False, None),
    ("", False, None),
    (None, False, None),
])
def test_parse_backend_origin(raw, production, expected):
    assert parse_backend_origin(raw, production=production) == expected


def test_decode_secret_requires_48_bytes_and_accepts_wrapped_base64():
    assert decode_secret(base64.b64encode(os.urandom(47)).decode()) is None
    wrapped = base64.encodebytes(os.urandom(64)).decode()   # openssl-style line breaks
    assert "\n" in wrapped and len(decode_secret(wrapped)) == 64
    assert decode_secret("not base64 !!!") is None
    assert decode_secret(None) is None


def test_render_counts_as_production():
    env = {"MCP_DELEGATION_SECRET": SECRET_B64, "MCP_BACKEND_ORIGIN": "http://localhost:8000"}
    assert load_config(env) is not None
    assert load_config({**env, "RENDER": "true"}) is None


@pytest.mark.parametrize("missing", ["MCP_DELEGATION_SECRET", "MCP_BACKEND_ORIGIN"])
async def test_missing_config_is_503(store, monkeypatch, missing):
    monkeypatch.delenv(missing)
    resp = await _post(_probe_app(), mint())
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "mcp_unavailable"
    assert store.inserted == []


async def test_short_secret_is_503(store, monkeypatch):
    monkeypatch.setenv("MCP_DELEGATION_SECRET", base64.b64encode(os.urandom(32)).decode())
    assert (await _post(_probe_app(), mint())).status_code == 503


# ---- happy path ----

async def test_valid_token_passes_and_stashes_user_id(store):
    resp = await _post(_probe_app(), mint())
    assert resp.status_code == 200
    assert resp.json() == {"user_id": SUB, "stashed": SUB}
    assert len(store.inserted) == 1
    inserted = store.inserted[0]
    assert uuid.UUID(inserted["jti"])
    assert inserted["expires_at"].endswith("+00:00")


# ---- rejected claims (each 401, and nothing consumed) ----

def _other_key_token():
    return mint(key=os.urandom(64))


def _es256_token():
    private = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
    ).decode()
    now = int(time.time())
    claims = {"iss": "astrail-mcp-gateway", "aud": ORIGIN + PATH, "sub": SUB, "client_id": CLIENT_ID,
              "scope": "mcp:read", "iat": now, "exp": now + 30, "jti": str(uuid.uuid4()),
              "bh": body_hash(BODY)}
    return jwt.encode(claims, private, algorithm="ES256", headers={"kid": "k"})


def _alg_none_token():
    now = int(time.time())
    claims = {"iss": "astrail-mcp-gateway", "aud": ORIGIN + PATH, "sub": SUB, "client_id": CLIENT_ID,
              "scope": "mcp:read", "iat": now, "exp": now + 30, "jti": str(uuid.uuid4()),
              "bh": body_hash(BODY)}
    return f"{_b64url(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{_b64url(json.dumps(claims).encode())}."


_NOW = int(time.time())

BAD_TOKENS = {
    "expired": lambda: mint(iat=int(time.time()) - 70, exp=int(time.time()) - 10),
    "future_iat": lambda: mint(iat=int(time.time()) + 30, exp=int(time.time()) + 60),
    "lifetime_over_60": lambda: mint(iat=int(time.time()), exp=int(time.time()) + 61),
    "lifetime_zero": lambda: mint(iat=int(time.time()), exp=int(time.time())),
    "lifetime_negative": lambda: mint(iat=int(time.time()) + 3, exp=int(time.time()) + 1),
    "float_exp": lambda: mint(exp=time.time() + 30),
    "missing_iat": lambda: mint(iat=_DROP),
    "wrong_iss": lambda: mint(iss="someone-else"),
    "missing_iss": lambda: mint(iss=_DROP),
    "aud_other_path": lambda: mint(aud=ORIGIN + "/internal/mcp/v1/other"),
    "aud_array": lambda: mint(aud=[ORIGIN + PATH]),
    "aud_other_origin": lambda: mint(aud="https://evil.example" + PATH),
    "aud_missing": lambda: mint(aud=_DROP),
    "scope_wrong": lambda: mint(scope="mcp:write"),
    "scope_superset": lambda: mint(scope="mcp:read mcp:write"),
    "scope_empty": lambda: mint(scope=""),
    "client_id_malformed": lambda: mint(client_id="not-a-uuid"),
    "client_id_missing": lambda: mint(client_id=_DROP),
    "sub_malformed": lambda: mint(sub="user-1"),
    "jti_malformed": lambda: mint(jti="abc"),
    "jti_missing": lambda: mint(jti=_DROP),
    "bh_malformed": lambda: mint(bh="short"),
    "bh_padded": lambda: mint(bh=body_hash(BODY) + "="),
    "bh_missing": lambda: mint(bh=_DROP),
    "wrong_key": _other_key_token,
    "es256": _es256_token,
    "alg_none": _alg_none_token,
    "garbage": lambda: "not.a.jwt",
}


@pytest.mark.parametrize("case", sorted(BAD_TOKENS))
async def test_bad_token_is_401(store, case):
    resp = await _post(_probe_app(), BAD_TOKENS[case]())
    assert resp.status_code == 401, case
    assert resp.json()["error"] == {"code": "unauthorized", "message": "Request could not be verified"}
    assert store.inserted == []


async def test_small_clock_skew_is_tolerated(store):
    now = int(time.time())
    assert (await _post(_probe_app(), mint(iat=now + 4, exp=now + 30))).status_code == 200
    assert (await _post(_probe_app(), mint(iat=now - 50, exp=now - 3))).status_code == 200


async def test_missing_or_malformed_bearer_is_401(store):
    app = _probe_app()
    assert (await _post(app, None)).status_code == 401
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(PATH, content=BODY, headers={"authorization": f"Basic {mint()}"})
    assert resp.status_code == 401


async def test_body_hash_mismatch_is_401(store):
    token = mint(body=b'{"limit":5}')
    resp = await _post(_probe_app(), token, body=b'{"limit":50}')
    assert resp.status_code == 401
    assert store.inserted == []


async def test_aud_binds_the_exact_path(store):
    token = mint(path=PATH)
    resp = await _post(_probe_app(), token, path="/internal/mcp/v1/other")
    assert resp.status_code == 401


# ---- replay ----

async def test_same_jti_twice_is_replayed(store):
    app = _probe_app()
    token = mint()
    assert (await _post(app, token)).status_code == 200
    second = await _post(app, token)
    assert second.status_code == 401
    assert second.json()["error"]["code"] == "replayed"


async def test_two_verifier_instances_share_the_store(store):
    token = mint()
    assert (await _post(_probe_app(), token)).status_code == 200
    assert (await _post(_probe_app(), token)).status_code == 401


async def test_concurrent_duplicates_exactly_one_succeeds(store):
    app = _probe_app()
    token = mint()
    results = await asyncio.gather(*(_post(app, token) for _ in range(8)))
    statuses = sorted(r.status_code for r in results)
    assert statuses == [200] + [401] * 7
    assert len(store.inserted) == 1


@pytest.mark.parametrize("failure", [
    APIError({"code": "PGRST205", "message": "relation missing", "details": None, "hint": None}),
    APIError({"code": "57014", "message": "statement timeout", "details": None, "hint": None}),
    ConnectionError("store down"),
])
async def test_store_unavailable_is_503(store, failure):
    store.fail = failure
    resp = await _post(_probe_app(), mint())
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "mcp_unavailable"


async def test_client_construction_failure_is_503(store, monkeypatch):
    async def _boom():
        raise KeyError("SUPABASE_URL")

    monkeypatch.setattr(auth_delegation, "get_supabase_client", _boom)
    assert (await _post(_probe_app(), mint())).status_code == 503


async def test_prune_runs_bounded_and_its_failure_is_harmless(store, monkeypatch, caplog):
    monkeypatch.setattr(auth_delegation, "should_prune", lambda: True)
    store.prune_fail = True
    with caplog.at_level(logging.INFO, logger="astrail.mcp.delegation"):
        resp = await _post(_probe_app(), mint())
    assert resp.status_code == 200
    assert store.prune_calls == [{"name": "mcp_delegation_jti_prune", "p_max": 100}]
    assert "mcp_delegation_prune_failed" in caplog.text
    assert "replay" not in caplog.text


def test_prune_probability_is_about_one_percent():
    assert auth_delegation.PRUNE_PROBABILITY == 0.01


# ---- privacy: never log the token, the body or a raw claim ----

async def test_logs_carry_no_token_body_or_sub(store, caplog):
    app = _probe_app()
    token = mint()
    sentinel_body = b'{"limit":5,"cursor":"SENTINELBODY"}'
    with caplog.at_level(logging.DEBUG):
        await _post(app, token)
        await _post(app, token)                              # replay
        await _post(app, mint(), body=sentinel_body)         # body-hash mismatch
        await _post(app, mint(iss="x"))                      # claim failure
    assert token not in caplog.text
    assert SUB not in caplog.text
    assert CLIENT_ID not in caplog.text
    assert "SENTINELBODY" not in caplog.text
    assert auth_delegation.sub_hash(SUB) in caplog.text      # the only identity that is logged


# ---- scope isolation against the REAL app ----

@pytest.fixture
def real_app(store):
    import main
    from rate_limit import limiter

    limiter.reset()
    main.app.dependency_overrides.clear()
    yield main.app
    main.app.dependency_overrides.clear()
    limiter.reset()


@pytest.mark.parametrize("method, path", [
    ("GET", "/settings/preferences"),
    ("POST", "/generate-trip"),
    ("POST", "/account/deletion"),
])
async def test_delegation_token_is_rejected_by_ordinary_routes(real_app, method, path):
    token = mint(path=path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=real_app), base_url="http://test") as c:
        resp = await c.request(method, path, content=b"{}" if method == "POST" else None,
                               headers={"authorization": f"Bearer {token}",
                                        "content-type": "application/json"})
    assert resp.status_code == 401


async def test_supabase_style_es256_token_is_rejected_by_mcp_router(real_app):
    resp = await _post(real_app, _es256_token(), path="/internal/mcp/v1/trips/list")
    assert resp.status_code == 401


class _EmptyTripsClient(FakeClient):
    """jti store plus an empty `trips` table, for the end-to-end wiring check."""

    def table(self, name):
        if name == "mcp_delegation_jti":
            return _JtiTable(self.store)
        return _EmptyQuery()


class _EmptyQuery:
    def __getattr__(self, _name):
        return lambda *a, **k: self

    async def execute(self):
        return _Result([])


async def test_real_router_accepts_a_valid_delegation_end_to_end(real_app, store, monkeypatch):
    import api.mcp_read as mcp_read

    async def _client():
        return _EmptyTripsClient(store)

    monkeypatch.setattr(auth_delegation, "get_supabase_client", _client)
    monkeypatch.setattr(mcp_read, "get_supabase_client", _client)
    path = "/internal/mcp/v1/trips/list"
    resp = await _post(real_app, mint(path=path), path=path)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"trips": [], "next_cursor": None}
    # A token minted for trips/list cannot be spent on saved-reels/list, even with the same body.
    other = "/internal/mcp/v1/saved-reels/list"
    assert (await _post(real_app, mint(path=path), path=other)).status_code == 401
