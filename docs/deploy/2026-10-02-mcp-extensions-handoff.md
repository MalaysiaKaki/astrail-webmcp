# MCP Extensions Trip Library handoff (2026-10-02)

Owner: Shaun (backend/MCP surface). Branch `feat/mcp-extensions`, local commits only; nothing pushed or deployed.

## What shipped

- Two app-only entrypoint tools, `open_trip_library` ("Astrail", global sidebar) and `open_trip_panel` ("Trips", conversation panel). Both accept `{}`, use `_meta.ui.visibility = ['app']`, read-only annotations, the per-request `ctx` and the OAuth `securitySchemes`.
- Resource `ui://astrail/library-v1.html`, a small shell that loads the library bundle from `/mcp-widget/library/v1/` (`library.js`, `library.css`).
- Trip Library UI (mobile first, notch-safe back bar) that lists trips and opens one through `render_itinerary`, reusing the itinerary widget components. It publishes a bounded model context (trip id, day, short summary) that the user can remove.
- No backend, DB, Pydantic, `backend-types.ts` or env change.

## Update 2026-10-03: live map in the Trip Library (branch `feat/trip-map-view`)

Owner: Shaun (MCP surface). Shared website seams (five, default-preserving) touch Zhi Hao's surface: `MapProvider` (`accessToken`, `onError`), `use-trip-layout` (`forceTripLayout`), `frame-padding` (forced layout), `safe-area` (`--safe-top`), and the nullable `feedback` prop. Website behaviour is unchanged with no override set.

- **v2 resource.** Both entrypoints now point at `ui://astrail/library-v2.html`, which loads `/mcp-widget/library/v2/`. Its CSP adds `connect-src https://api.mapbox.com https://events.mapbox.com` and `https://api.mapbox.com` to the resource domains, mirrored in `openai/widgetCSP`. A trip opens on the website's phone trip page: live Mapbox map, pins, day strip, Stay, Fit and 3D, with the compact/expanded sheet.
- **v1 kept.** `ui://astrail/library-v1.html` and `/mcp-widget/library/v1/` stay published with the old CSP and the same new bundle. A host that cached the v1 shell gets Mapbox requests blocked by CSP; the map latch fires and every trip shows the static `WidgetView` (verified in the browser). Remove v1 only after a host-cache policy is decided.
- **Refresh the connector** (ChatGPT, Plugins, Refresh) so hosts pick up the v2 resource URI. Until then a cached host keeps v1 (static view).
- **Token.** The entrypoint results carry `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` (already set on Vercel production; the earlier probe used it) in model-hidden `_meta['astrail/mapbox_token']`. Only `pk.` values pass; an `sk.` value gives no token. The token is never logged, rendered or put in model text.
- **Fallback behaviour (three cases).**
  1. **Static selection, no latch:** no token, no WebGL, or a zero-day trip shows the static `WidgetView` directly.
  2. **Latch:** a Mapbox error **before the style loads** (import, construct, style), a render-time throw in the map view, or a map not ready 15 s after a trip opens latches `mapFailed` for the rest of that library session: the map provider unmounts and every trip renders the static `WidgetView`, on the day the user last chose.
  3. **Not handled (deferred):** errors **after** load (tiles, style, worker) leave a degraded map. Mapbox's default console errors are suppressed, so check the network panel.
- **Probe removed.** The throwaway `open_map_probe` tool, its resource and `/mcp-widget/probe/v1/` are gone. A host with a cached tool list may show "unknown tool" for it until the connector is refreshed.
- **Bundle size.** `library.js` 2,604,039 B (about 712 KB gzip), `library.css` 96,593 B (about 17 KB gzip); Mapbox GL JS is most of it. It loads only when a library entrypoint opens; the v3 inline card is unchanged (sha256 below still matches).
- **Kill switch `MCP_LIBRARY_MAP`.** Server env on Vercel; this handoff doc is the env reference (`docs/ENV.md` does not exist). Only the exact value `off` disables the map: the entrypoint results then carry a **null** token value (the `astrail/mapbox_token` key stays present). It affects **newly returned entrypoint results**: newly opened libraries go static; an already-open library keeps its map until it is closed and reopened; it does not retract context already attached. Any other value, or unset, leaves the map on.

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

Live check (original Trip Library, PR #6 — passed on Desktop and iPhone 2026-10-03): both entrypoints open; tap a trip and the detail renders (proves `_meta` forwarding); the context chip appears; remove the chip, then change day: it does not re-attach; reopen the trip: it re-attaches; an old model-invoked v3 card still works. Android was not tested. For the live map, use the post-deploy gate below.

**First live check (untested assumption):** tapping a trip relies on ChatGPT's `callServerTool` returning the result `_meta` (`astrail/bundle`) to the app. Failure signature: every tapped trip shows "Couldn't display this itinerary" while the model-invoked card still works. Fix then: an app-only tool that returns the bundle in `structuredContent`.

### Release gate: live map (run right after deploy)

Merge is deploy and the connector runs in dev mode, so run this on the **real library in ChatGPT Desktop and iPhone** immediately after the deploy, with the kill switch ready. Record the host versions. Android is outstanding unless tested. Cover: both entrypoints; list to trip (`_meta` forwarding); labels; 3D; safe areas; chip removal then day change; A, Back, B; an old v3 card; a cached v1 shell (static fallback); a refreshed v2 shell.

On ChatGPT Desktop and on an iPhone, open "Astrail" from the sidebar and tap a trip. Check:

1. The map renders with street and place **labels/glyphs** (not blank tiles), the pins, and the route; the sheet sits over the lower half and the map shows above it.
2. The Back circle (chevron, label "Back to all trips") and the Fit/3D controls sit below the notch / host chrome; the sheet's last row clears the home indicator.
3. **3D** toggles to a pitched view with terrain and back, with no blank map.
4. On Day 2, tap a Day 1 pin: the day strip **switches to Day 1** and the sheet scrolls to that stop.
5. Stay shows the hotels and the hotel card. Known website behaviour: on a phone the hotel card runs up under the Back control (phone framing leaves no popup room; same root cause as the website phone page, `components/map/frame-padding.ts` around line 150). Confirmed known issue, deferred to Zhi Hao; trigger: before broader publication. Note whether it is usable.
6. Open trip A, Back, trip B, Back, trip A: each shows only its own pins.
7. The **context chip** appears; remove it, change day: it does not re-attach.
8. An **old model-invoked v3 card** in a chat still renders and works.
9. If the map does not appear, read the browser console / network for blocked requests before widening the CSP, then use the kill switch if needed.

Availability caveats as stated by OpenAI docs on 2026-10-02: Free/Go on web is "coming soon"; composer mentions are desktop-only.

## Rollback

**Live map (2026-10-03): use the kill switch, not a revert.** Set the Vercel env `MCP_LIBRARY_MAP=off` and redeploy. The entrypoints then return a null token and every newly opened library uses `WidgetView` (open libraries keep their map until reopened). Keep both resource URIs (`library-v1`, `library-v2`) and both asset paths published: a revert would delete the v2 assets that cached v2 shells still load, which would blank those libraries. To re-enable, unset the variable and redeploy.

Whole Trip Library (original rollback):

1. Remove the two `register*` calls in `server.ts`, AND revert `frontend/scripts/mcp-smoke.mjs` to the five tool names and the entrypoint cases in `handler.test.ts` / `tools.test.ts`; otherwise the live smoke and the tests fail.
2. Keep `mcp-app/library/` and the vite / `emit-module` changes (a harmless dark bundle). The assets under `public/` are gitignored and regenerated on each Vercel build, so there is nothing under `public/` to keep.
3. Redeploy.

Limits of a rollback: hosts with a cached tool list keep showing the entrypoints ("unknown tool" until the connector is refreshed); already-open library iframes may keep working until closed; context already attached to a composer is not retracted.

## Dev preview

`frontend/mcp-app/library-preview.html` + `library/preview.tsx`: fake ChatGPT host for local visual QA (`?empty=1`, `?long=1`, `?theme=dark`, `?inline=1`; host insets top 47 / bottom 34). Dev-only; not in the production bundle. For the live map, export `VITE_MAPBOX_PREVIEW_TOKEN` (a `pk.` token, never committed) in the shell that starts Vite with `--config mcp-app/vite.config.ts`; the preview puts it in the entrypoint result `_meta` like the real tools. The preview spreads the fixture's places over real Tokyo / Osaka coordinates so pins do not stack.

QA evidence (2026-10-03, headless Chrome + SwiftShader, real Mapbox tiles): screenshots in `.gstack/qa/mcp-trip-map/` of the main checkout; report in `.superpowers/sdd/2026-10-03-mcp-trip-map-view/task-6-report.md`.

## Deferrals

| Deferred | Trigger |
|---|---|
| Live ChatGPT test (mobile first); first check `callServerTool` forwards `_meta` | Shaun's next tunnel session; required before merge to `dev` |
| Pagination beyond 50 trips | An account exceeds 50 trips |
| Restore attached trip on remount | Live test shows the panel losing its place |
| Live map in the inline v3 card | Demand for maps inside chat answers (v4 card; bundle size) |
| Remove `library-v1` resource and `/mcp-widget/library/v1/` | An explicit host-cache/refresh policy is accepted |
| Desktop floating-panel layout for the library map | Users find the full-width phone sheet awkward on wide Desktop |
| Post-load fatal map error fallback | Seen live (today only pre-load errors fall back) |
| Phone hotel card room under the top controls (shared `frame-padding`) | Before broader publication (owner: Zhi Hao); confirmed known issue |
| Composer @-mentions | Desktop users ask for them |
| Native plugin settings | A remote preferences write contract exists |
| Rich forms (MRTR) | MRTR-capable SDK adopted and a write flow needs it |
| Global quick action "New trip" | A remote create-trip tool exists |
| Thumbnails on cards/chips | `trips/list` returns a cover URL (Pydantic + TS + migration parity) |
| Saved Reels tab, deep links, "Ask about this day" | User demand after the live test |
| `ui.domain` + plugin packaging | Decision to publish in the plugin directory |
| `@openai/mcp-extensions` dependency | We use its settings/mentions/forms helpers |
| Persistent (CI) v3 hash pin | A second contributor touches `mcp-app/` |
