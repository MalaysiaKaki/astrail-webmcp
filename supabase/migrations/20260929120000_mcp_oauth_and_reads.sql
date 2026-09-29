-- Remote MCP: OAuth client allowlist, a routing addition to the SHARED access-token hook, the
-- delegation replay store, and the service-only Saved Reels read (docs/mcp-app/PLAN.md §2.2,
-- §2.3, §4.4).
--
-- ⚠ THIS REDEFINES A SHARED FUNCTION. `private.astrail_mcp_access_token` (and
-- `public.astrail_app_memberships`) belong to the astrail-app migration history
-- (MalaysiaKaki/astrail-app, 20260924133722_astrail_app_membership_and_mcp_tokens.sql). Production
-- (ngfssihvukhxxqhcudix) already runs that function as its Custom Access Token hook. The
-- astrail-app owner must REVIEW section 2 before this is applied.
--
-- What changes for existing traffic: NOTHING. A token whose client_id has no ENABLED row in
-- public.mcp_oauth_clients gets exactly the prior behaviour: the membership check with the same
-- exception text, aud https://astrail-mcp.vercel.app/mcp, role astrail_mcp_resource,
-- astrail_mcp_access = true, and exp capped at iat + 900. Browser tokens (no client_id) pass through
-- unchanged. The ONLY addition: a listed client gets its row's `resource` as aud instead.
--
-- Section 1 bootstraps the astrail-app objects only when the membership table is ABSENT, so
-- this repo's local and CI stack, which replays only this repo's migrations, has them. On
-- production, where they exist, it does nothing at all (no re-grants); it never drops or alters them.
--
-- PROPOSED — NOT APPLIED. A human applies it to the production project (PLAN §9,
-- docs/deploy/2026-09-29-mcp-app-rollout.md); agents never do. Order:
--   1. apply this migration (existing tokens behave exactly as before);
--   2. insert the MCP OAuth client's row into public.mcp_oauth_clients.
-- There is NO dashboard change: the hook pointer stays on private.astrail_mcp_access_token.
-- Revert: re-apply the astrail-app definition of the function verbatim, then drop
-- mcp_oauth_clients, mcp_delegation_jti, mcp_delegation_jti_prune and saved_reel_cards_for_user.
-- Never drop the bootstrapped astrail-app objects: production owns them.

-- ── 1. Bootstrap the astrail-app objects (a TRUE no-op where they exist) ─────────────────────
-- Everything below runs ONLY when the membership table is absent (a fresh local/CI database).
-- On production the table exists, so its grants and policies are never re-applied here — any
-- deliberate production drift from the astrail-app definition is left exactly as it is.
create schema if not exists private;

do $$
begin
  if to_regclass('public.astrail_app_memberships') is null then
    create table public.astrail_app_memberships (
      user_id uuid primary key references auth.users(id) on delete cascade,
      created_at timestamptz not null default now()
    );
    alter table public.astrail_app_memberships enable row level security;
    revoke all on public.astrail_app_memberships from public, anon, authenticated;
    grant select, insert on public.astrail_app_memberships to authenticated;
    grant select on public.astrail_app_memberships to supabase_auth_admin;
    create policy memberships_read_own on public.astrail_app_memberships for select to authenticated
      using ((select auth.uid()) = user_id and (select auth.jwt()->>'client_id') is null);
    create policy memberships_join_own on public.astrail_app_memberships for insert to authenticated
      with check ((select auth.uid()) = user_id and (select auth.jwt()->>'client_id') is null);
    create policy memberships_auth_hook_read on public.astrail_app_memberships for select
      to supabase_auth_admin using (true);
  end if;
end;
$$;

-- ── 1b. OAuth clients whose tokens get a per-client audience ────────────────────────────────
-- The hook reads this as supabase_auth_admin. Grants alone do not bypass RLS, so that role also
-- gets a SELECT policy; it gets no write access of any kind.
create table public.mcp_oauth_clients (
  client_id uuid primary key,
  resource text not null,
  enabled boolean not null default true
);

alter table public.mcp_oauth_clients enable row level security;

revoke all on table public.mcp_oauth_clients from public, anon, authenticated;
grant all on table public.mcp_oauth_clients to service_role;

grant usage on schema public to supabase_auth_admin;
grant select on table public.mcp_oauth_clients to supabase_auth_admin;

create policy mcp_clients_auth_admin_read
on public.mcp_oauth_clients
for select
to supabase_auth_admin
using (true);

-- ── 2. The shared hook, with per-client audience routing ─────────────────────────────────────
-- Same signature, language, volatility, security and search_path as the astrail-app definition,
-- and the same body except the marked lookup. The client_id is compared as TEXT against the uuid
-- rendered as text, so a non-UUID client_id can never raise a cast error. Refresh issuance
-- (`token_refresh`) carries the same client_id (F2), so it is routed identically. The membership
-- check applies to listed clients too (same app-first policy). The audience is FIXED per client —
-- this is not RFC 8707 resource binding (PLAN §2.2).
create or replace function private.astrail_mcp_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  v_resource text;
begin
  if coalesce(claims->>'client_id', '') <> '' then
    if not exists (select 1 from public.astrail_app_memberships where user_id = (event->>'user_id')::uuid) then
      raise exception 'Open the Astrail app and enable AI connections before connecting an AI client.';
    end if;
    -- ADDED (mcp-app): a listed, enabled client gets its own audience.
    select c.resource
      into v_resource
      from public.mcp_oauth_clients c
     where c.enabled
       and c.client_id::text = lower(claims->>'client_id');
    claims := jsonb_set(claims, '{aud}', to_jsonb(coalesce(v_resource, 'https://astrail-mcp.vercel.app/mcp')));
    claims := jsonb_set(claims, '{role}', '"astrail_mcp_resource"');
    claims := jsonb_set(claims, '{astrail_mcp_access}', 'true');
    claims := jsonb_set(claims, '{exp}', to_jsonb(least((claims->>'exp')::bigint, (claims->>'iat')::bigint + 900)));
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;

revoke all on function private.astrail_mcp_access_token(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.astrail_mcp_access_token(jsonb) to supabase_auth_admin;

-- ── 3. Delegation-token replay store ─────────────────────────────────────────────────────────
-- backend/auth_delegation.py INSERTs each jti; the primary key IS the replay check (23505 →
-- 401 replayed). Durable, so it survives restarts and instances (F11). RLS on with no policies:
-- only service_role (which bypasses RLS) touches it.
create table public.mcp_delegation_jti (
  jti uuid primary key,
  expires_at timestamptz not null
);

create index mcp_delegation_jti_expires_at_idx on public.mcp_delegation_jti (expires_at);

alter table public.mcp_delegation_jti enable row level security;

revoke all on table public.mcp_delegation_jti from public, anon, authenticated, service_role;
grant select, insert, delete on table public.mcp_delegation_jti to service_role;

-- Best-effort, bounded cleanup (~1% of requests call it with p_max = 100). Only rows already
-- past expires_at go; a row still inside its replay window is never removed. p_max is required
-- and bounded: `limit null` would mean "no limit".
create or replace function public.mcp_delegation_jti_prune(p_max int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted int;
begin
  if p_max is null or p_max < 1 or p_max > 500 then
    raise exception 'p_max must be between 1 and 500' using errcode = '22023';
  end if;

  delete from public.mcp_delegation_jti
   where jti in (
     select j.jti
       from public.mcp_delegation_jti j
      where j.expires_at < now()
      order by j.expires_at
      limit p_max
   );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on every new function; revoke it explicitly
-- (the request_seat pattern, 20260803130000).
revoke execute on function public.mcp_delegation_jti_prune(int) from public, anon, authenticated;
grant execute on function public.mcp_delegation_jti_prune(int) to service_role;

-- ── 4. saved_reel_cards for a GIVEN user, for the service-role backend ───────────────────────
-- The saved_reel_cards view filters on auth.uid(), which is NULL for service_role, so the MCP
-- backend sees zero rows through it (F6). This reproduces the view's LATEST definition
-- (20260720120000_saved_reels_cache_signal_v2.sql; no later migration redefines it) with the
-- owner taken from p_user_id. The organized + mapbox-country-v1 gates stay MENTION-JOIN
-- conditions, so pending and failed cards still come back, with empty places — as in the view.
-- The view itself is unchanged. Keyset: (created_at, id) DESC, strictly after the cursor pair.
create or replace function public.saved_reel_cards_for_user(
  p_user_id uuid,
  p_limit int,
  p_after_created timestamptz default null,
  p_after_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  normalized_url text,
  source_platform text,
  reel_cache_id uuid,
  analysis_status text,
  personal_label text,
  retry_after timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  caption text,
  thumbnail_url text,
  places jsonb,
  has_current_cache boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'p_limit must be between 1 and 200' using errcode = '22023';
  end if;
  if (p_after_created is null) <> (p_after_id is null) then
    raise exception 'p_after_created and p_after_id go together' using errcode = '22023';
  end if;

  return query
  select
    saved_reels.id,
    saved_reels.user_id,
    saved_reels.normalized_url,
    saved_reels.source_platform,
    saved_reels.reel_cache_id,
    saved_reels.analysis_status,
    saved_reels.personal_label,
    saved_reels.retry_after,
    saved_reels.analyzed_at,
    saved_reels.created_at,
    saved_reels.updated_at,
    reel_cache.caption,
    reel_cache.thumbnail_url,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'place_id', reel_place_mentions.place_id,
          'name', places.name,
          'lat', places.lat,
          'lng', places.lng,
          'country_code', places.country_code,
          'country_name', places.country_name,
          'evidence_quote', reel_place_mentions.evidence_quote,
          'source_url', reel_place_mentions.source_url,
          'source_reel_url', saved_reels.normalized_url,
          'confidence', reel_place_mentions.confidence
        ) order by places.name
      ) filter (where reel_place_mentions.place_id is not null),
      '[]'::jsonb
    ) as places,
    coalesce(reel_cache.extractor_version = '2026-07-20.1', false) as has_current_cache
  from public.saved_reels
  left join public.reel_cache
    on reel_cache.id = saved_reels.reel_cache_id
  left join public.reel_place_mentions
    on reel_place_mentions.reel_cache_id = saved_reels.reel_cache_id
   and reel_place_mentions.verification_version = 'mapbox-country-v1'
   and reel_place_mentions.user_id = saved_reels.user_id
   and saved_reels.analysis_status = 'organized'
  left join public.places
    on places.id = reel_place_mentions.place_id
  where saved_reels.user_id = p_user_id
    and (
      p_after_created is null
      or (saved_reels.created_at, saved_reels.id) < (p_after_created, p_after_id)
    )
  group by
    saved_reels.id,
    saved_reels.user_id,
    saved_reels.normalized_url,
    saved_reels.source_platform,
    saved_reels.reel_cache_id,
    reel_cache.extractor_version,
    saved_reels.analysis_status,
    saved_reels.personal_label,
    saved_reels.retry_after,
    saved_reels.analyzed_at,
    saved_reels.created_at,
    saved_reels.updated_at,
    reel_cache.caption,
    reel_cache.thumbnail_url
  order by saved_reels.created_at desc, saved_reels.id desc
  limit p_limit;
end;
$$;

revoke execute on function public.saved_reel_cards_for_user(uuid, int, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.saved_reel_cards_for_user(uuid, int, timestamptz, uuid)
  to service_role;
