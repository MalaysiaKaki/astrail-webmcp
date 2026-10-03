# MCP Extensions Trip Library handoff (2026-10-02)

Owner: Shaun (backend/MCP surface). Branch `feat/mcp-extensions`, local commits only; nothing pushed or deployed.

## What shipped

- Two app-only entrypoint tools, `open_trip_library` ("Astrail", global sidebar) and `open_trip_panel` ("Trips", conversation panel). Both accept `{}`, use `_meta.ui.visibility = ['app']`, read-only annotations, the per-request `ctx` and the OAuth `securitySchemes`.
- Resource `ui://astrail/library-v1.html`, a small shell that loads the library bundle from `/mcp-widget/library/v1/` (`library.js`, `library.css`).
- Trip Library UI (mobile first, notch-safe back bar) that lists trips and opens one through `render_itinerary`, reusing the itinerary widget components. It publishes a bounded model context (trip id, day, short summary) that the user can remove.
- No backend, DB, Pydantic, `backend-types.ts` or env change.

## Compatibility

- The five existing tools and the v3 resource are pinned by snapshot tests; `/mcp-widget/v3/*` and `generated/itinerary-v3.ts` match the pre-branch SHA-256 baseline.
- Hosts other than ChatGPT ignore the `openai/*` keys. Only MCP-Apps-aware hosts honour `_meta.ui.visibility`; a plain MCP host may expose the two entrypoint tools to its model as read-only `list_trips(limit 50)` equivalents (harmless).
- v3 release evidence (sha256, identical to the pre-branch baseline and to the final rebuild):
  - `3562c12614687e3ad55138ce3a6558e2d95a2a251035a70d9191fdeacb0893e2` `public/mcp-widget/v3/itinerary.css`
  - `ec61ccc19962e465b91c325a6f93d08b711b7a21311bc77345fae121f94f1b5f` `public/mcp-widget/v3/itinerary.js`
  - `efdcfa17ee09cd5aef50ca9d61665663baa73d1477ab71c1b2d408f1ed1e18d8` `lib/mcp/widget/generated/itinerary-v3.ts`

## Live test for Shaun (mobile first)

1. Tunnel per `docs/deploy/2026-09-29-mcp-app-rollout.md` section 2.
2. ChatGPT, Plugins, Refresh the connector.
3. On iOS and Android: "Astrail" appears in the sidebar; open it, tap a trip; in a chat, open the "Trips" panel.
4. Then desktop. Record the ChatGPT app version and plan.

Merge gate (live, iOS and Android): both entrypoints open; tap a trip and the detail renders (proves `_meta` forwarding); the context chip appears; remove the chip, then change day: it does not re-attach; reopen the trip: it re-attaches; an old model-invoked v3 card still works.

**First live check (untested assumption):** tapping a trip relies on ChatGPT's `callServerTool` returning the result `_meta` (`astrail/bundle`) to the app. Failure signature: every tapped trip shows "Couldn't display this itinerary" while the model-invoked card still works. Fix then: an app-only tool that returns the bundle in `structuredContent`.

Availability caveats as stated by OpenAI docs on 2026-10-02: Free/Go on web is "coming soon"; composer mentions are desktop-only.

## Rollback

1. Remove the two `register*` calls in `server.ts`, AND revert `frontend/scripts/mcp-smoke.mjs` to the five tool names and the entrypoint cases in `handler.test.ts` / `tools.test.ts`; otherwise the live smoke and the tests fail.
2. Keep `mcp-app/library/` and the vite / `emit-module` changes (a harmless dark bundle). The assets under `public/` are gitignored and regenerated on each Vercel build, so there is nothing under `public/` to keep.
3. Redeploy.

Limits of a rollback: hosts with a cached tool list keep showing the entrypoints ("unknown tool" until the connector is refreshed); already-open library iframes may keep working until closed; context already attached to a composer is not retracted.

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
