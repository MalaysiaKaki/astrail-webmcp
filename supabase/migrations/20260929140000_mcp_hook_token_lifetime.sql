-- Remote MCP: listed (mcp_oauth_clients) OAuth clients keep the project's normal access-token
-- lifetime instead of the shared hook's 15-minute cap.
--
-- WHY: Supabase computes `expires_in` BEFORE the Custom Access Token Hook runs, so a hook that
-- shortens `exp` makes the token endpoint report 3600 s for a JWT that dies at 900 s. ChatGPT
-- trusts `expires_in`, keeps using the token after it has expired, our /mcp correctly answers 401,
-- and the app shows "0 tools" until the user reconnects. Observed live 2026-09-29. Leaving `exp`
-- untouched for OUR clients makes the JWT and `expires_in` agree, so ChatGPT refreshes on time
-- (it holds a refresh token via offline_access).
--
-- ⚠ THIS REDEFINES THE SHARED FUNCTION again (see 20260929120000_mcp_oauth_and_reads.sql and the
-- astrail-app migration history). The ONLY change from 20260929120000: the 900 s cap now applies to
-- clients NOT listed in mcp_oauth_clients — i.e. exactly astrail-app/astrail-mcp's clients keep their
-- 15-minute tokens, byte-for-byte the prior behaviour. Listed clients still get their own aud,
-- role astrail_mcp_resource, astrail_mcp_access = true, and the membership check.
-- Security for listed clients: our gateway still mints a separate ≤60 s, single-use, body-bound
-- delegation token per backend call; audience, client allowlist, role and scope checks are unchanged.
--
-- PROPOSED — a human applies it (psql -X -1 -v ON_ERROR_STOP=1 -f <this file>). Afterwards, each
-- listed client's NEXT issued token (sign-in or refresh) gets the normal lifetime.
-- Revert: re-apply the function body from 20260929120000_mcp_oauth_and_reads.sql.

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
    -- mcp-app: a listed, enabled client gets its own audience.
    select c.resource
      into v_resource
      from public.mcp_oauth_clients c
     where c.enabled
       and c.client_id::text = lower(claims->>'client_id');
    claims := jsonb_set(claims, '{aud}', to_jsonb(coalesce(v_resource, 'https://astrail-mcp.vercel.app/mcp')));
    claims := jsonb_set(claims, '{role}', '"astrail_mcp_resource"');
    claims := jsonb_set(claims, '{astrail_mcp_access}', 'true');
    -- astrail-app's 15-minute cap, for its own (non-listed) clients only. Listed clients keep the
    -- project lifetime so `exp` matches the `expires_in` Supabase already reported.
    if v_resource is null then
      claims := jsonb_set(claims, '{exp}', to_jsonb(least((claims->>'exp')::bigint, (claims->>'iat')::bigint + 900)));
    end if;
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;

revoke all on function private.astrail_mcp_access_token(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.astrail_mcp_access_token(jsonb) to supabase_auth_admin;
