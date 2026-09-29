# Remote MCP server for ChatGPT: runbook (local test, then production)

**Owner:** Shaun (the whole MCP surface).
**Branch:** `feat/mcp-app`.
**Design:** `docs/mcp-app/PLAN.md`.

**The agent applied nothing.** Every Supabase and deploy step below is a human action.

## 0. How auth works (shared with astrail-app / astrail-mcp)

This server **reuses** the production OAuth setup the astrail-app team already built on Supabase project `ngfssihvukhxxqhcudix` (see `MalaysiaKaki/astrail-app` `docs/authentication.md`):

- **Already done in production:**
  - OAuth 2.1 server enabled; dynamic registration **off**; clients registered by hand
  - Site URL `https://astrail-app.vercel.app`, so **every** OAuth client's sign-in and consent runs on `https://astrail-app.vercel.app/oauth/consent`
  - app-first membership: a user must **Enable AI connections** once on `https://astrail-app.vercel.app/account`
  - one access-token hook, `private.astrail_mcp_access_token`: 15-minute tokens with `role=astrail_mcp_resource` and `astrail_mcp_access=true`
- **What our migration adds:**
  - the same hook now picks `aud` per client from `public.mcp_oauth_clients`; any client NOT listed keeps exactly the previous behaviour (`aud=https://astrail-mcp.vercel.app/mcp`), so astrail-mcp is unaffected
  - no dashboard change, no Site URL change, no hook switch

| Piece | Where | When unconfigured |
|---|---|---|
| `POST /mcp`, `/.well-known/oauth-protected-resource/mcp` | this repo's frontend (Next) | 503 (fails closed) |
| `POST /internal/mcp/v1/{trips/list,trips/itinerary,saved-reels/list}` | this repo's backend (FastAPI) | 503; no other route changes |
| Migration `supabase/migrations/20260929120000_mcp_oauth_and_reads.sql` | Supabase | See §1 |

## 1. One-time Supabase steps (production project)

### 1.1 Tell the astrail-app owner first

The migration redefines the shared function `private.astrail_mcp_access_token`. The behaviour for clients not in `mcp_oauth_clients` is unchanged, but it's their function. Have them review the diff, and re-run their rollback SQL tests after you apply it.

### 1.2 Apply the migration

The migration is idempotent against the teammate's existing objects (`create … if not exists`), and it only replaces the hook function body.

```bash
cd ~/Projects/astrail-mcp-app
psql "$PROD_DB_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260929120000_mcp_oauth_and_reads.sql
```

Then check that astrail-mcp still works: its OAuth-connected client should still list its tools.

### 1.3 Enable AI connections for your account

Sign in at `https://astrail-app.vercel.app/account` and click **Enable AI connections**. Without it, the hook refuses to issue any MCP token.

## 2. Local test in ChatGPT (your laptop, tunnelled)

ChatGPT connects from OpenAI's servers, so your local `/mcp` needs a public HTTPS URL. Use your ngrok static domain (ngrok dashboard → Domains); it must not change, because tokens are tied to the exact URL.

### 2.1 Shell setup

```bash
cd ~/Projects/astrail-mcp-app
export TUNNEL=https://<your-static-domain>.ngrok-free.app
export MCP_SECRET=$(openssl rand -base64 64 | tr -d '\n')
export PROD_DB_URL='<production Postgres connection string>'
cp ../astrail/frontend/.env.local frontend/.env.local
cp ../astrail/backend/.env backend/.env
(cd frontend && npm ci && npm run build:widgets)
(cd backend && uv sync)
```

### 2.2 Register a ChatGPT client for the tunnel

1. In ChatGPT, go to **Settings → Security and login** and turn on **Developer mode**.
2. Go to https://chatgpt.com/plugins and click **+**. Set the URL to `$TUNNEL/mcp` and **Auth** to **OAuth**, then open the advanced OAuth settings.
3. Copy the **callback URL** it shows. **Don't submit yet.**
4. In Supabase, go to **Authentication → OAuth Server → Clients → New**:
   - Type: confidential
   - Token auth: `client_secret_post`
   - Redirect URI: exactly that callback URL

   Copy the client ID and secret.
5. Route that client to the tunnel's resource:

```bash
export CLIENT_ID=<client uuid>
psql "$PROD_DB_URL" -c "insert into public.mcp_oauth_clients (client_id, resource) values ('$CLIENT_ID', '$TUNNEL/mcp');"
```

### 2.3 Environment

```bash
cat >> frontend/.env.local <<EOF
MCP_RESOURCE_URL=$TUNNEL/mcp
MCP_AUTH_ISSUER=https://ngfssihvukhxxqhcudix.supabase.co/auth/v1
MCP_AUTH_JWKS_URL=https://ngfssihvukhxxqhcudix.supabase.co/auth/v1/.well-known/jwks.json
MCP_ALLOWED_CLIENT_IDS=$CLIENT_ID
MCP_BACKEND_ORIGIN=http://localhost:8000
MCP_DELEGATION_SECRET=$MCP_SECRET
EOF
cat >> backend/.env <<EOF
MCP_DELEGATION_SECRET="$MCP_SECRET"
MCP_BACKEND_ORIGIN="http://localhost:8000"
EOF
```

### 2.4 Run the three processes (separate tabs)

```bash
# --lifespan off is REQUIRED: the normal startup runs job recovery + the reaper against the SHARED
# production database, which can re-run a teammate's generation job and spend real credits before
# any MCP call. The MCP read routes do not need the lifespan (the Supabase client is created lazily).
cd ~/Projects/astrail-mcp-app/backend && uv run --env-file .env uvicorn main:app --host 127.0.0.1 --port 8000 --lifespan off
cd ~/Projects/astrail-mcp-app/frontend && npx next dev -p 3000   # dev mode: `next start` refuses an http backend
ngrok http 3000 --url=$TUNNEL
```

Before ChatGPT, verify with MCP Inspector:

```bash
curl -s $TUNNEL/.well-known/oauth-protected-resource/mcp     # "resource" must equal $TUNNEL/mcp
npx @modelcontextprotocol/inspector                           # Streamable HTTP → $TUNNEL/mcp → expect 401 + WWW-Authenticate
```

### 2.5 Connect

1. Finish the ChatGPT form: paste the client ID and secret, then create.
2. ChatGPT opens **astrail-app's** sign-in and consent (`astrail-app.vercel.app`). Sign in with the same account you enabled in §1.3, then approve.
3. The tools list should show 5 tools. Try:
   - "What are my Astrail trips?"
   - "Show my \<trip\> itinerary as a card"
   - "Which hotel is refundable?"

What to record:

| # | Check | Pass |
|---|---|---|
| 1 | Consent loads | No 400. This is the supabase/auth#2820 risk; astrail-app has not proven a real exchange either. |
| 2 | Allow → tools listed; Deny → ChatGPT reports access denied | Both behave |
| 3 | `list_trips` / `get_itinerary` / `render_itinerary` | Real data; the card renders |
| 4 | After ~15 minutes, a tool call still works | The refreshed token still routes to `$TUNNEL/mcp` (the hook runs on refresh too) |
| 5 | astrail-mcp still works for its client | Unaffected |
| 6 | Wrong / changed / omitted `resource` for this client (Inspector OAuth) | Not accepted at `/mcp`. The hook binds by client, not by requested resource (PLAN Q11). |

### 2.6 Afterwards

- Stop the three processes. Never start the local backend without `--lifespan off` against production.
- Tear down the tunnel client **in this order**:
  1. **delete the OAuth client** in Supabase (Authentication → OAuth Server → Clients), which revokes the authorization;
  2. then remove its routing row: `delete from public.mcp_oauth_clients where client_id = '$CLIENT_ID';`

  Removing only the row does NOT revoke anything. That client's next tokens would fall back to astrail-mcp's audience (the shared hook's default), and already-issued tokens stay valid for up to 15 minutes.

## 3. Production rollout (after the local test passes)

Register the production client **first**, so the one frontend deploy already has its final client ID.

1. **Supabase:** register the production ChatGPT client (same steps as §2.2, but with URL `https://astrail.xyz/mcp`). Then map it:
   `insert into public.mcp_oauth_clients (client_id, resource) values ('<prod client>', 'https://astrail.xyz/mcp');`
2. **Backend (Render):** set `MCP_DELEGATION_SECRET` (a new `openssl rand -base64 64`, not the tunnel one) and `MCP_BACKEND_ORIGIN` (its public origin), then deploy. `POST $BACKEND/internal/mcp/v1/trips/list` without a token should return 401. Render uses the normal lifespan; that's correct for the deployed service.
3. **Frontend (Vercel):**
   - set `MCP_RESOURCE_URL=https://astrail.xyz/mcp`
   - set `MCP_AUTH_ISSUER` and `MCP_AUTH_JWKS_URL` as in §2.3
   - set `MCP_ALLOWED_CLIENT_IDS=<prod client>`: the production client only, never the tunnel one
   - set `MCP_BACKEND_ORIGIN`, and `MCP_DELEGATION_SECRET` (the same value as Render)

   Deploy.
4. **Check that everything agrees before connecting:** the client ID in Vercel = the Supabase client = the `mcp_oauth_clients` row; that row's `resource` = `MCP_RESOURCE_URL` exactly; `/.well-known/oauth-protected-resource/mcp` returns 200 with that resource; `/mcp` without a token returns 401.
5. Connect in ChatGPT and repeat the §2.5 checks. Also check shared-hook compatibility with **fresh** tokens:
   - a new astrail-mcp connection (new issuance and a refresh)
   - an ordinary website login and refresh

   An existing astrail-mcp token doesn't exercise the changed hook. Then run PLAN §7.4 step 5 on iOS and Android.
6. **Optional: the widget's route maps** (`MCP_MAPBOX_STATIC_TOKEN`, off when unset; the card renders without them).
   Each map is one paid Mapbox Static Images request, made by `GET /api/mcp/static-map`. What bounds that spend:
   - Vercel's CDN caches each signed map for ≤ 24 h, never past its signed expiry: the main control. The route
     only accepts the canonical `?p=&s=` query, and refuses requests carrying `Authorization` or `Range`
     (they would bypass the CDN cache). After deploy, request one map twice and check `x-vercel-cache: HIT`.
   - Per function instance only: identical in-flight requests share one fetch, and a small token bucket returns 429.
     There is **no shared, cross-instance limiter**. The remaining ceilings are the Mapbox account itself (set a
     usage alert or cap on the token's account) and, optionally, a **Vercel Firewall rate-limit rule** on
     `/api/mcp/static-map` (e.g. per-IP, a few dozen requests per minute) — recommended before enabling the token.
   - To turn maps off at once: unset `MCP_MAPBOX_STATIC_TOKEN` and redeploy (the route answers 404, cards hide the map).

## 4. Rollback

**Stop THIS server accepting a client** (takes effect on the next request): remove it from `MCP_ALLOWED_CLIENT_IDS` and redeploy. For the whole endpoint, unset `MCP_RESOURCE_URL` (→ 503).

**Revoke a client's access** (both servers): delete or deactivate the OAuth client in Supabase. Tokens already issued stay valid until they expire (≤15 minutes).

**Routing row** (`mcp_oauth_clients.enabled = false` or delete): this only changes the audience of *future* tokens, which then fall back to astrail-mcp's audience. It is **not** a revocation, and a client left registered could then use astrail-mcp. Always revoke the client first (above).

**Backend:** unset `MCP_DELEGATION_SECRET` (→ `/internal/mcp/v1/*` returns 503).

**Hook:** re-apply the teammate's original function body (their migration) before dropping `mcp_oauth_clients`. The replacement hook reads that table.
