# MCP Extensions Trip Library handoff (2026-10-02)

Owner: Shaun (backend/MCP surface). Branch `feat/mcp-extensions`, local commits only; nothing pushed or deployed.

## What shipped

- Two app-only entrypoint tools, `open_trip_library` ("Astrail", global sidebar) and `open_trip_panel` ("Trips", conversation panel). Both accept `{}`, use `_meta.ui.visibility = ['app']`, read-only annotations, the per-request `ctx` and the OAuth `securitySchemes`.
- Resource `ui://astrail/library-v1.html`, a small shell that loads the library bundle from `/mcp-widget/library/v1/` (`library.js`, `library.css`).
- Trip Library UI (mobile first, notch-safe back bar) that lists trips and opens one through `render_itinerary`, reusing the itinerary widget components. It publishes a bounded model context (trip id, day, short summary) that the user can remove.
- No backend, DB, Pydantic, `backend-types.ts` or env change.

## Compatibility

- The five existing tools and the v3 resource are pinned by snapshot tests; `/mcp-widget/v3/*` and `generated/itinerary-v3.ts` match the pre-branch SHA-256 baseline.
- Hosts other than ChatGPT ignore the `openai/*` keys and the app-only tools.

## Live test for Shaun (mobile first)

1. Tunnel per `docs/deploy/2026-09-29-mcp-app-rollout.md` section 2.
2. ChatGPT, Plugins, Refresh the connector.
3. On iOS and Android: "Astrail" appears in the sidebar; open it, tap a trip; in a chat, open the "Trips" panel.
4. Then desktop. Record the ChatGPT app version and plan.

**First live check (untested assumption):** tapping a trip relies on ChatGPT's `callServerTool` returning the result `_meta` (`astrail/bundle`) to the app. Failure signature: every tapped trip shows "Couldn't display this itinerary" while the model-invoked card still works. Fix then: an app-only tool that returns the bundle in `structuredContent`.

Availability caveats as stated by OpenAI docs on 2026-10-02: Free/Go on web is "coming soon"; composer mentions are desktop-only.

## Rollback

Remove the two `register*` calls in `server.ts` and redeploy. Keep the library build and `/mcp-widget/library/v1`; a full revert would delete regenerated assets that cached shells still load. Hosts that cached the tool list show "unknown tool" until the connector is refreshed.

## Dev preview

`frontend/mcp-app/library-preview.html` + `library/preview.tsx`: fake ChatGPT host for local visual QA (`?empty=1`, `?long=1`). Dev-only; not in the production bundle.

## Deferrals

| Deferred | Trigger |
|---|---|
| Live ChatGPT test (mobile first); first check `callServerTool` forwards `_meta` | Shaun's next tunnel session; required before merge to `dev` |
| Pagination beyond 50 trips | An account exceeds 50 trips |
| Restore attached trip on remount | Live test shows the panel losing its place |
| Interactive Mapbox GL map | Static route maps prove insufficient (CSP, token, size plan) |
| Composer @-mentions | Desktop users ask for them |
| Native plugin settings | A remote preferences write contract exists |
| Rich forms (MRTR) | MRTR-capable SDK adopted and a write flow needs it |
| Global quick action "New trip" | A remote create-trip tool exists |
| Thumbnails on cards/chips | `trips/list` returns a cover URL (Pydantic + TS + migration parity) |
| Saved Reels tab, deep links, "Ask about this day" | User demand after the live test |
| `ui.domain` + plugin packaging | Decision to publish in the plugin directory |
| `@openai/mcp-extensions` dependency | We use its settings/mentions/forms helpers |
| Persistent (CI) v3 hash pin | A second contributor touches `mcp-app/` |
