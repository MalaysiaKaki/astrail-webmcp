begin;

create extension if not exists pgtap with schema extensions;

select plan(64);

-- 20260929120000_mcp_oauth_and_reads (docs/mcp-app/PLAN.md §4.4, §7.3). Proves:
--   * the SHARED hook private.astrail_mcp_access_token gives an ENABLED listed client its own aud — on authorization_code AND token_refresh —
--     while unknown, disabled and non-UUID clients get exactly the prior astrail-app claims,
--     non-members get the exact astrail-app exception, and browser tokens pass through;
--   * supabase_auth_admin holds exactly what the hook needs (schema usage, SELECT-only grants, the
--     RLS read policy) — asserted from the catalog, because the local/CI stack does not let the test
--     user SET ROLE supabase_auth_admin (astrail-app hit the same limit). The execution proof is
--     production: a token for a listed client came back with that client's aud (2026-09-29);
--   * the replay store rejects a duplicate jti with 23505, and prune removes only expired rows,
--     at most p_max, refusing a null or out-of-range p_max;
--   * all three functions are closed to PUBLIC, anon and authenticated;
--   * saved_reel_cards_for_user matches the saved_reel_cards view for the same user, isolates
--     owners, keeps the mention-join gates, and pages (created_at, id) DESC across TIED timestamps.

-- ── Seed ────────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000002201', 'mcp-a@example.com'),
  ('00000000-0000-0000-0000-000000002202', 'mcp-b@example.com');

insert into public.mcp_oauth_clients (client_id, resource, enabled) values
  ('22000000-0000-4000-8000-0000000abcde', 'https://astrail.example/mcp', true),
  ('22000000-0000-4000-8000-000000000002', 'https://astrail.example/mcp', false);

-- ── 1. The shared hook private.astrail_mcp_access_token ─────────────────────────────────────
-- Run as the test user: the function is SECURITY INVOKER with an empty search_path and only reads
-- two tables, so its output does not depend on the caller beyond privileges (asserted in §2). A DO
-- block runs each case and records either the output or the error text. iat 1900000000 with a 1h exp, so
-- the 900 s cap is visible on NON-listed clients (listed ones keep their exp since 20260929140000);
-- 'short' has exp inside the cap.
insert into public.astrail_app_memberships (user_id) values ('00000000-0000-0000-0000-000000002201');

create temporary table hook_case (label text primary key, event jsonb not null, out jsonb, err text);
insert into hook_case (label, event)
select label, jsonb_build_object(
    'user_id', user_id, 'authentication_method', method,
    'claims', jsonb_strip_nulls(jsonb_build_object(
      'aud', 'authenticated', 'sub', user_id, 'role', 'authenticated', 'email', 'mcp@example.com',
      'iat', 1900000000, 'exp', exp, 'client_id', client_id, 'session_id', 'sess-1')))
  from (values
    ('listed',       '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-0000000abcde', 1900003600),
    ('listed upper', '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-0000000abcde', 1900003600),
    ('refresh',      '00000000-0000-0000-0000-000000002201', 'token_refresh',                     '22000000-0000-4000-8000-0000000abcde', 1900003600),
    ('unlisted',     '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-0000000000ff', 1900003600),
    ('disabled',     '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-000000000002', 1900003600),
    ('non-uuid',     '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', 'chatgpt-connector', 1900003600),
    ('short',        '00000000-0000-0000-0000-000000002201', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-0000000000ff', 1900000300),
    ('non-member',   '00000000-0000-0000-0000-000000002202', 'oauth_provider/authorization_code', '22000000-0000-4000-8000-0000000abcde', 1900003600),
    ('browser',      '00000000-0000-0000-0000-000000002202', 'password',                          null, 1900003600)
  ) as c(label, user_id, method, client_id, exp);
update hook_case
   set event = jsonb_set(event, '{claims,client_id}', to_jsonb(upper(event #>> '{claims,client_id}')))
 where label = 'listed upper';
do $$
declare
  r record;
begin
  for r in select label, event from hook_case loop
    begin
      update hook_case set out = private.astrail_mcp_access_token(r.event) where label = r.label;
    exception when others then
      update hook_case set err = sqlerrm where label = r.label;
    end;
  end loop;
end;
$$;

-- The astrail-app behaviour, as a value: what every NON-listed client must still get.
create temporary view prior_claims as
  select label, (event -> 'claims') || jsonb_build_object(
           'aud', 'https://astrail-mcp.vercel.app/mcp', 'role', 'astrail_mcp_resource',
           'astrail_mcp_access', true,
           'exp', least((event #>> '{claims,exp}')::bigint, (event #>> '{claims,iat}')::bigint + 900)) as claims
    from hook_case;

select is((select out #>> '{claims,aud}' from hook_case where label = 'listed'), 'https://astrail.example/mcp',
  'listed client: aud is its mcp_oauth_clients resource');
select is(
  (select out -> 'claims' from hook_case where label = 'listed'),
  (select claims || jsonb_build_object('aud', 'https://astrail.example/mcp', 'exp', 1900003600)
     from prior_claims where label = 'listed'),
  'listed client: role astrail_mcp_resource, astrail_mcp_access true, own aud, exp NOT capped, all else kept');
select is((select (out #>> '{claims,exp}')::bigint from hook_case where label = 'listed'), 1900003600::bigint,
  'listed client keeps the project token lifetime (exp matches the expires_in Supabase reports; 20260929140000)');
select is((select out - 'claims' from hook_case where label = 'listed'), '{}'::jsonb,
  'the hook returns {claims} only, as before');
select is((select out #>> '{claims,aud}' from hook_case where label = 'listed upper'), 'https://astrail.example/mcp',
  'client_id matching is case-insensitive (compared as lowercase text)');
select is(
  (select out -> 'claims' from hook_case where label = 'refresh'),
  (select claims || jsonb_build_object('aud', 'https://astrail.example/mcp', 'exp', 1900003600)
     from prior_claims where label = 'refresh'),
  'token_refresh with a listed client_id is routed identically (own aud, uncapped exp)');
select is((select out -> 'claims' from hook_case where label = 'unlisted'),
  (select claims from prior_claims where label = 'unlisted'),
  'non-listed client: exactly the prior astrail-app claims');
select is((select out -> 'claims' from hook_case where label = 'disabled'),
  (select claims from prior_claims where label = 'disabled'),
  'disabled row: exactly the prior astrail-app claims');
select is((select out -> 'claims' from hook_case where label = 'non-uuid'),
  (select claims from prior_claims where label = 'non-uuid'),
  'non-UUID client_id: prior claims, no cast error');
select is((select err from hook_case where label = 'non-uuid'), null::text, 'non-UUID client_id raises nothing');
select is((select (out #>> '{claims,exp}')::bigint from hook_case where label = 'short'), 1900000300::bigint,
  'an exp already inside the 900 s cap is kept');
select is((select err from hook_case where label = 'non-member'),
  'Open the Astrail app and enable AI connections before connecting an AI client.',
  'a non-member with a client_id (even a listed one) gets the exact astrail-app exception');
select is((select out from hook_case where label = 'non-member'), null::jsonb, 'the non-member gets no token');
select is((select out from hook_case where label = 'browser'),
  (select jsonb_build_object('claims', event -> 'claims') from hook_case where label = 'browser'),
  'browser token (no client_id): claims unchanged, membership not required');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'astrail_app_memberships'
      and policyname in ('memberships_read_own', 'memberships_join_own', 'memberships_auth_hook_read')), 3,
  'the astrail-app membership policies are bootstrapped');

-- ── 2. supabase_auth_admin: read, never write (catalog checks; SET ROLE is unavailable here) ──
select ok(exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'mcp_oauth_clients'
                     and policyname = 'mcp_clients_auth_admin_read' and cmd = 'SELECT'
                     and roles = array['supabase_auth_admin']::name[] and qual = 'true'),
  'mcp_oauth_clients has a SELECT-only RLS policy for supabase_auth_admin (RLS would hide rows otherwise)');
select ok(has_schema_privilege('supabase_auth_admin', 'public', 'USAGE'),
  'supabase_auth_admin can use schema public (to reach mcp_oauth_clients)');
select ok(has_schema_privilege('supabase_auth_admin', 'private', 'USAGE'),
  'supabase_auth_admin can use schema private (to run the hook)');
select ok(has_table_privilege('supabase_auth_admin', 'public.astrail_app_memberships', 'SELECT'),
  'supabase_auth_admin can read the membership table the hook checks');

select table_privs_are('public', 'mcp_oauth_clients', 'supabase_auth_admin', array['SELECT'],
  'supabase_auth_admin holds SELECT only on mcp_oauth_clients');
select table_privs_are('public', 'mcp_oauth_clients', 'anon', array[]::text[], 'anon has no access to mcp_oauth_clients');
select table_privs_are('public', 'mcp_oauth_clients', 'authenticated', array[]::text[],
  'authenticated has no access to mcp_oauth_clients');
select table_privs_are('public', 'mcp_delegation_jti', 'anon', array[]::text[], 'anon has no access to mcp_delegation_jti');
select table_privs_are('public', 'mcp_delegation_jti', 'authenticated', array[]::text[],
  'authenticated has no access to mcp_delegation_jti');
select table_privs_are('public', 'mcp_delegation_jti', 'service_role', array['SELECT', 'INSERT', 'DELETE'],
  'service_role holds exactly SELECT, INSERT, DELETE on mcp_delegation_jti');
select ok((select relrowsecurity from pg_class where oid = 'public.mcp_oauth_clients'::regclass),
  'mcp_oauth_clients has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.mcp_delegation_jti'::regclass),
  'mcp_delegation_jti has RLS enabled');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002201","role":"authenticated"}', true);
select throws_ok($$select * from public.mcp_oauth_clients$$, '42501', null,
  'authenticated is refused mcp_oauth_clients');
select throws_ok($$select * from public.mcp_delegation_jti$$, '42501', null,
  'authenticated is refused mcp_delegation_jti');
reset role;

-- ── 3. Function privileges: closed to PUBLIC / anon / authenticated ─────────────────────────
create temporary table fn_privs (sig text, owner_role text);
insert into fn_privs values
  ('private.astrail_mcp_access_token(jsonb)', 'supabase_auth_admin'),
  ('public.mcp_delegation_jti_prune(integer)', 'service_role'),
  ('public.saved_reel_cards_for_user(uuid,integer,timestamp with time zone,uuid)', 'service_role');

select ok(not has_function_privilege('anon', sig, 'EXECUTE'), 'anon cannot execute ' || sig) from fn_privs;
select ok(not has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated cannot execute ' || sig)
  from fn_privs;
select ok(
  not exists (select 1 from pg_proc p, aclexplode(p.proacl) acl
               where p.oid = sig::regprocedure and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
  'PUBLIC cannot execute ' || sig) from fn_privs;
select ok(has_function_privilege(owner_role, sig, 'EXECUTE'), owner_role || ' can execute ' || sig) from fn_privs;

-- ── 4. Replay store, as service_role ────────────────────────────────────────────────────────
set local role service_role;
select lives_ok(
  $$insert into public.mcp_delegation_jti (jti, expires_at) values ('22100000-0000-4000-8000-000000000001', now() + interval '65 seconds')$$,
  'service_role records a fresh jti');
select throws_ok(
  $$insert into public.mcp_delegation_jti (jti, expires_at) values ('22100000-0000-4000-8000-000000000001', now() + interval '65 seconds')$$,
  '23505', null, 'a replayed jti raises unique_violation (23505)');

insert into public.mcp_delegation_jti (jti, expires_at) values
  ('22100000-0000-4000-8000-000000000011', now() - interval '3 minutes'),
  ('22100000-0000-4000-8000-000000000012', now() - interval '2 minutes'),
  ('22100000-0000-4000-8000-000000000013', now() - interval '1 minute'),
  ('22100000-0000-4000-8000-000000000014', now() + interval '1 minute');

select is(public.mcp_delegation_jti_prune(2), 2, 'prune removes at most p_max expired rows');
select is(
  (select array_agg(jti::text order by jti) from public.mcp_delegation_jti),
  array['22100000-0000-4000-8000-000000000001', '22100000-0000-4000-8000-000000000013',
        '22100000-0000-4000-8000-000000000014'],
  'prune took the OLDEST expired rows first and kept every live one');
select is(public.mcp_delegation_jti_prune(100), 1, 'a second prune removes only the remaining expired row');
select is((select count(*)::int from public.mcp_delegation_jti where expires_at >= now()), 2,
  'rows still inside their replay window are never pruned');
select throws_ok($$select public.mcp_delegation_jti_prune(null)$$, '22023', null, 'prune refuses a null p_max');
select throws_ok($$select public.mcp_delegation_jti_prune(0)$$, '22023', null, 'prune refuses p_max below 1');
select throws_ok($$select public.mcp_delegation_jti_prune(501)$$, '22023', null, 'prune refuses p_max above 500');
reset role;

-- ── 5. saved_reel_cards_for_user ────────────────────────────────────────────────────────────
insert into public.reel_cache (id, normalized_url, source_platform, caption, thumbnail_url, extractor_version) values
  ('22200000-0000-4000-8000-000000000001', 'https://www.instagram.com/reel/MCP-1', 'instagram', 'c1', 'https://cdn.example/1.jpg', '2026-07-20.1'),
  ('22200000-0000-4000-8000-000000000002', 'https://www.instagram.com/reel/MCP-2', 'instagram', 'c2', 'https://cdn.example/2.jpg', 'old'),
  ('22200000-0000-4000-8000-000000000003', 'https://www.instagram.com/p/MCP-3', 'instagram', 'c3', null, null);

insert into public.places (id, name, place_type, lat, lng, country, city, country_code, country_name) values
  ('22300000-0000-4000-8000-000000000001', 'Verified Place', 'attraction', 35.68, 139.76, 'Japan', 'Tokyo', 'JP', 'Japan'),
  ('22300000-0000-4000-8000-000000000002', 'Legacy Place', 'attraction', 35.69, 139.70, 'Japan', 'Tokyo', 'JP', 'Japan');

-- Three of A's saved Reels share ONE created_at so keyset pagination must break ties on id.
insert into public.saved_reels (id, user_id, normalized_url, reel_cache_id, analysis_status, analyzed_at, created_at) values
  ('22400000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000002201', 'https://www.instagram.com/reel/MCP-1',
   '22200000-0000-4000-8000-000000000001', 'organized', now(), timestamptz '2026-09-01 10:00:00+00'),
  ('22400000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000002201', 'https://www.instagram.com/reel/MCP-2',
   '22200000-0000-4000-8000-000000000002', 'failed', null, timestamptz '2026-09-01 10:00:00+00'),
  ('22400000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000002201', 'https://www.instagram.com/p/MCP-3',
   '22200000-0000-4000-8000-000000000003', 'not_analyzed', null, timestamptz '2026-09-01 10:00:00+00'),
  ('22400000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000002201', 'https://www.instagram.com/reel/MCP-OLD',
   null, 'not_analyzed', null, timestamptz '2026-08-01 10:00:00+00'),
  ('22400000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000002202', 'https://www.instagram.com/reel/MCP-1',
   '22200000-0000-4000-8000-000000000001', 'organized', now(), timestamptz '2026-09-02 10:00:00+00');

insert into public.reel_place_mentions (user_id, reel_cache_id, place_id, evidence_quote, source_url, confidence, verification_version) values
  -- A, organized, verified: the only mention A's cards may show.
  ('00000000-0000-0000-0000-000000002201', '22200000-0000-4000-8000-000000000001', '22300000-0000-4000-8000-000000000001', 'A quote', null, 0.9, 'mapbox-country-v1'),
  -- A, organized, but a legacy verification version: gated out.
  ('00000000-0000-0000-0000-000000002201', '22200000-0000-4000-8000-000000000001', '22300000-0000-4000-8000-000000000002', 'legacy', null, 0.9, 'legacy-v0'),
  -- A, verified, but the Reel is 'failed': gated out, the card still returns with no places.
  ('00000000-0000-0000-0000-000000002201', '22200000-0000-4000-8000-000000000002', '22300000-0000-4000-8000-000000000001', 'stale', null, 0.9, 'mapbox-country-v1'),
  -- B's own mention on the same Reel: never on A's card.
  ('00000000-0000-0000-0000-000000002202', '22200000-0000-4000-8000-000000000001', '22300000-0000-4000-8000-000000000002', 'B quote', null, 0.9, 'mapbox-country-v1');

-- Result tables are created by the test's superuser and filled under each role, so no role
-- needs TEMP. `with no data` copies the exact column types of the view / RPC.
create temporary table view_rows as
  select id, user_id, normalized_url, source_platform, reel_cache_id, analysis_status, personal_label,
         retry_after, analyzed_at, created_at, updated_at, caption, thumbnail_url, places, has_current_cache
    from public.saved_reel_cards with no data;
create temporary table rpc_rows as
  select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 1) with no data;
create temporary table rpc_pages (page int not null, id uuid not null, created_at timestamptz not null);
grant insert on view_rows to authenticated;
grant insert on rpc_rows to service_role;
grant select, insert on rpc_pages to service_role;

set local role anon;
select throws_ok(
  $$select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 10)$$,
  '42501', null, 'anon is refused saved_reel_cards_for_user');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002201","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 10)$$,
  '42501', null, 'authenticated is refused saved_reel_cards_for_user, even for its own id');
insert into view_rows
  select id, user_id, normalized_url, source_platform, reel_cache_id, analysis_status, personal_label,
         retry_after, analyzed_at, created_at, updated_at, caption, thumbnail_url, places, has_current_cache
    from public.saved_reel_cards;
reset role;

set local role service_role;
insert into rpc_rows
  select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 200);
insert into rpc_pages
  select 1, id, created_at from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 2);
insert into rpc_pages
  select 2, id, created_at from public.saved_reel_cards_for_user(
    '00000000-0000-0000-0000-000000002201', 2,
    (select created_at from rpc_pages where page = 1 order by created_at, id limit 1),
    (select id from rpc_pages where page = 1 order by created_at, id limit 1));
insert into rpc_pages
  select 3, id, created_at from public.saved_reel_cards_for_user(
    '00000000-0000-0000-0000-000000002201', 2,
    (select created_at from rpc_pages where page = 2 order by created_at, id limit 1),
    (select id from rpc_pages where page = 2 order by created_at, id limit 1));
select throws_ok($$select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 0)$$,
  '22023', null, 'p_limit below 1 is refused');
select throws_ok($$select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 201)$$,
  '22023', null, 'p_limit above 200 is refused');
select throws_ok(
  $$select * from public.saved_reel_cards_for_user('00000000-0000-0000-0000-000000002201', 5, now(), null)$$,
  '22023', null, 'a half cursor is refused');
reset role;

select is((select count(*)::int from view_rows), 4, 'fixture premise: the view shows A exactly four cards');
select results_eq(
  $$select id, user_id, normalized_url, source_platform, reel_cache_id, analysis_status, personal_label,
           retry_after, analyzed_at, created_at, updated_at, caption, thumbnail_url, places, has_current_cache
      from view_rows order by id$$,
  $$select id, user_id, normalized_url, source_platform, reel_cache_id, analysis_status, personal_label,
           retry_after, analyzed_at, created_at, updated_at, caption, thumbnail_url, places, has_current_cache
      from rpc_rows order by id$$,
  'the RPC for A returns exactly what the saved_reel_cards view shows A (every column)');
select ok(
  not exists (select 1 from rpc_rows where user_id <> '00000000-0000-0000-0000-000000002201'),
  'owner isolation: no other user''s saved Reel is returned');
select is(
  (select places from rpc_rows where id = '22400000-0000-4000-8000-00000000000a') #>> '{0,name}',
  'Verified Place', 'the organized card carries its verified, owner-scoped mention');
select is(
  jsonb_array_length((select places from rpc_rows where id = '22400000-0000-4000-8000-00000000000a')), 1,
  'legacy-version and other-user mentions are gated out as join conditions');
select is((select places from rpc_rows where id = '22400000-0000-4000-8000-00000000000b'), '[]'::jsonb,
  'a failed card is still returned, with empty places');
select is(
  (select count(distinct created_at)::int from rpc_rows
    where id in ('22400000-0000-4000-8000-00000000000a', '22400000-0000-4000-8000-00000000000b',
                 '22400000-0000-4000-8000-00000000000c')), 1,
  'fixture premise: three of A''s cards tie on created_at');
select is(
  (select array_agg(id::text order by page, created_at desc, id desc) from rpc_pages),
  array['22400000-0000-4000-8000-00000000000c', '22400000-0000-4000-8000-00000000000b',
        '22400000-0000-4000-8000-00000000000a', '22400000-0000-4000-8000-00000000000d'],
  'keyset pages of 2 return every card exactly once, in (created_at, id) DESC order');
select is(
  (select array_agg(page order by page, created_at desc, id desc) from rpc_pages), array[1, 1, 2, 2],
  'the tie is split across pages by id, and the third page is empty');

select * from finish();

rollback;
