# Live-map trip view in the ChatGPT Trip Library — Implementation Plan (rev 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Rev 2 folds in two plan reviews (Codex 6/10, Claude 5.5/10), both available as files:
> `/Users/shaunliew/Projects/astrail/.gstack/mcp-trip-map-plan-review-codex.md` and the Claude findings summarised in "Review folds" at the end.

**Goal:** When a user opens a trip from the Astrail sidebar entry or the "Trips" panel in ChatGPT, show the **website's mobile trip page as a viewer**. That means a live interactive Mapbox map (pins, trail lines, day emphasis, 3D), the bottom sheet with the day strip, the stop timeline, the selected-place card, eat/stay suggestions and "About this trip". It replaces the library's detail view (`WidgetView` + static day images). The inline v3 card is untouched.

**Feasibility evidence (2026-10-03, live map probe, PR #8):**
- ChatGPT Desktop and iOS 18.7 both show WebGL true, `blob:` worker ok, and Mapbox Standard style loaded in 809 / 1,930 ms with the CSP below.
- Origins differ per platform and **no Referer** is sent, so the token must not depend on URL restriction.

**Architecture:**
- **Token.** The entrypoint tools return the public Mapbox token in the model-hidden `_meta`.
- **Resource.** The library resource bumps to v2 and declares the Mapbox CSP.
- **Root.** `library/main.tsx` forces the phone layout **at module init**, and mounts **one** website `MapProvider` (with `accessToken`) around the whole library when a token exists.
- **Detail view.** A new `library/TripMapView.tsx` mirrors `TripWorkspace`'s state, including reveal. It renders the website's `TripMap` + `MobileTripSheet` + `SheetHeading`/`DateStrip`/`TripPanelBody` (already exported) + a widget-local control strip.
- **Fallback.** Map failure is detected fast (MapProvider `onError` seam), latched for the whole library, and falls back to today's `WidgetView`.

## Scope (Shaun, 2026-10-03)
- **In:**
  - The live-map **viewer** of the user's own trip on both entrypoints.
  - Day switching, pin↔list selection with reveal, eat/stay, 3D, fit, and About this trip.
  - The model context (trip + day).
  - Probe removal.
- **Out (deferred):**
  - Feedback, regenerate/edit, hotel booking or any write.
  - The desktop floating panel. **One phone layout at all widths, full-width bottom sheet.** No width cap, so camera padding stays coherent.
  - The live map in the inline v3 card.
  - Interactive-tab URL state.

## Global constraints
- Worktree `/Users/shaunliew/Projects/astrail-mcp-ext`, branch `feat/trip-map-view` (from `origin/main` `ff8c756`).
  - npm/npx/vitest/tsc run in `frontend/`; git runs in the worktree root.
  - Never push.
  - `frontend/.env.local` does **not** exist in the worktree. Never copy secrets in.
- **Ponytail (full).** Codex: `$ponytail` / `$ponytail-review`. Claude: read the SKILL.md found by `ls -d /Users/shaunliew/.codex/plugins/cache/ponytail/ponytail/*/skills/ponytail` (currently 1.0.0).
- **Frozen:**
  - The v3 inline card: `ui://astrail/itinerary-v3.html`, `/mcp-widget/v3/*` and `generated/itinerary-v3.ts`. Its sha256 must equal a **fresh** baseline taken at `ff8c756` in Task 1 Step 0, at the end of every task.
  - The five legacy tool descriptors (snapshots; never `vitest -u`).
  - `components/trip/mobile/**` and `panel/**` are Tailwind-scanned by v3's `widget.css`, so **no class-string changes** there. The shared seams below are logic-only.
- **Shared website code (Zhi Hao's surface).** Only these **five** additive, default-preserving seams are authorized, all in Task 2. Any other shared-file change: stop and report.
  1. `components/map/MapProvider.tsx`: optional `accessToken?: string` and `onError?: (reason: string) => void`.
  2. `lib/trip/use-trip-layout.ts`: `forceTripLayout(layout | null)` with subscriber notification.
  3. `components/map/frame-padding.ts`: the `wide` decision honours the **explicit forced override** (`getForcedTripLayout()`); with no override, today's numeric-width rule is unchanged.
  4. `lib/trip/safe-area.ts`: the probe uses `var(--safe-top, env(safe-area-inset-top, 0px))`. The website never sets `--safe-top`, so behaviour is unchanged.
  5. `components/trip/mobile/AboutThisTrip.tsx` plus the `feedback` prop types in `MobileTripView.tsx` (`MobileTripViewProps`, `TripPanelBody`): widen `feedback` to `FeedbackComposer | null`. **`feedback === null` hides the feedback row.** `undefined` keeps today's meaning (the panel keeps its own draft; existing website tests rely on it). The existing `!readOnly` + status allowlist stays. The widget passes `readOnly={false}` and `feedback={null}`. `SheetHeading` is untouched (its Sample badge is already `readOnly`-only). Inside `TripPanelBody`, forward `feedback={p.feedback ?? undefined}` to `DesktopAbout` (it types `feedback?: FeedbackComposer`), so `DesktopAbout` is not touched and website behaviour is unchanged. Logic-only; no class strings.
- **Viewer, not sample.** Never pass `readOnly` (it means demo/sample trail: "Sample" badge and "A saved example…" copy).
- **No Astrail/Supabase/backend network from the widget.** Trip data arrives only via the existing `render_itinerary` result. Mapbox requests are the only allowed network.
- **Token:** `pk.`-only, model-hidden `_meta['astrail/mapbox_token']`, never logged, rendered or put in model text. An `sk.` value gives null (test).
- **Library v2 resource CSP:**
  - `connectDomains: ['https://api.mapbox.com', 'https://events.mapbox.com']`
  - `resourceDomains: [...widgetCsp(config).resourceDomains, 'https://api.mapbox.com']`
  - Mirror both in `openai/widgetCSP`.
- **Logging:** no payload logging. The library bundle passes the LEAKS scan. Fixed-string warnings only. Mapbox's default AJAX `console.error` is suppressed by our `error` listener.
- **Mobile-first:**
  - Host safe-area via `--safe-*`.
  - Tap targets ≥ 48 px. The Mapbox map sits outside `[data-library]`, so the 48 px rule never reaches its markers.
  - No horizontal scroll.
  - Paper look in a dark host (keep the `[data-library]` root paint).
- Vitest uses `NODE_OPTIONS=--no-experimental-webstorage`. Use `set -o pipefail`. Single quotes, no semicolons. Stage explicit paths. Trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review focus
1. **Module-load crash blanks the whole library.** `next/link`, mock-auth and session code read `process.env` at module scope. A **browser** load gate on the built bundle, with no token, is required (Task 5, repeated in Task 6). jsdom cannot catch it.
2. **Map failure.** No token, no WebGL, CSP blocked (e.g. a cached v1 shell), style/tile error, or a 15 s backstop all fall back to `WidgetView` fast, latched library-wide. Never a blank page.
3. **Repeated open/close on the single shared map.** No leaked markers, layers or listeners; old pins never show on the next trip.
4. **Wide Desktop and iPhone geometry.** The forced phone layout reaches the camera padding. Host insets reach the probe, sheet and controls. Pins are framed outside the sheet and controls.
5. **Bounded or odd data:**
   - Truncated stops/quotes get an honest notice.
   - Places without coordinates are listed but not pinned.
   - The first place has no coordinates.
   - A day has no places.
   - **A zero-day trip falls back to `WidgetView`.**

---

### Task 1: Server — token on the entrypoints, library resource v2, keep v1, probe removal
**Step 0.**
```bash
set -o pipefail; cd /Users/shaunliew/Projects/astrail-mcp-ext/frontend
npm ci
npm run build:widgets
rm -rf /tmp/astrail-v3-baseline && mkdir -p /tmp/astrail-v3-baseline
shasum -a 256 public/mcp-widget/v3/* lib/mcp/widget/generated/itinerary-v3.ts > /tmp/astrail-v3-baseline/SHA256SUMS
```

**Files:** `lib/mcp/tools/library.ts`, `lib/mcp/widget/library-resource.ts`, `lib/mcp/contract.ts`, `lib/mcp/server.ts`; delete `lib/mcp/tools/map-probe.ts`; tests `tools.test.ts`, `handler.test.ts`, `scripts/mcp-smoke.mjs`.
- **Token.**
  - Kill switch: when `process.env.MCP_LIBRARY_MAP === 'off'`, the token is null (test). This is the rollback lever: every **newly opened** library falls back to `WidgetView`; iframes already open keep their token until reopened or the connector is refreshed. Document `MCP_LIBRARY_MAP` in the handoff doc (this repo has no `docs/ENV.md` or `frontend/.env.example`).
  - Move `publicMapboxToken` (pk.-only) into `tools/library.ts`.
  - Both entrypoint results add `_meta: { [MAPBOX_TOKEN_META_KEY]: publicMapboxToken(process.env) }`, with `MAPBOX_TOKEN_META_KEY = 'astrail/mapbox_token'` in contract.ts.
- **Resource.**
  - `LIBRARY_RESOURCE_URI = 'ui://astrail/library-v2.html'`, assets at `/mcp-widget/library/v2`, Mapbox CSP.
  - **Also keep registering** `ui://astrail/library-v1.html` unchanged: same shell pointing at `/mcp-widget/library/v1`, the **old** CSP. Cached v1 hosts keep working; under the old CSP the map is blocked and the `onError` latch falls back to `WidgetView`.
  - Keep both v1 and v2 registered and published until an explicit host-cache/refresh policy is accepted (deferral).
- **Probe removal:** delete the probe tool, resource, icon entry and tests. The inventory is 7 tools.
- **Tests (red first):**
  - Token: `pk.` passes, `sk.` gives null, and `MCP_LIBRARY_MAP=off` gives null.
  - The v2 resource has the Mapbox CSP and v2 asset path.
  - The v1 resource is still served with its old CSP.
  - The inventory has 7 tools.
  - The legacy snapshots are unchanged.

### Task 2: The five authorized shared seams (logic-only, defaults preserved)
**Files:**
- Production: `components/map/MapProvider.tsx`, `lib/trip/use-trip-layout.ts`, `components/map/frame-padding.ts`, `lib/trip/safe-area.ts`, `components/trip/mobile/AboutThisTrip.tsx`, `components/trip/mobile/MobileTripView.tsx` (the `feedback` prop types only)
- Tests: their existing tests plus new cases

**`MapProvider`** gets `accessToken?` and `onError?`.
- Explicit `accessToken` wins over env for **both** `hasToken` and `acquire`. Keep the context value's memo dependencies coherent so callbacks never capture a stale override.
- `onError(reason)` fires **once per map instance** for:
  - a rejected `import('mapbox-gl')` (add a `.catch`; today there is none);
  - a throwing `new Map`;
  - the first `map.on('error')` **before** `load`.
- Fixed `reason` strings: `'import' | 'construct' | 'style'`. Never pass the event payload, which may contain URLs.
- Registering the `error` listener also stops Mapbox's default `console.error`.
- An import or constructor failure also resets the internal loading flag, so a later acquire can retry.
- Default (no `onError`): today's behaviour.

**`use-trip-layout`** gets `forceTripLayout(layout: 'mobile' | 'desktop' | null)`.
- It sets the override and notifies `useSyncExternalStore` subscribers.
- Export `getForcedTripLayout(): 'mobile' | 'desktop' | null`. It returns the override only, never the viewport result. The hook honours the override before `matchMedia`.

**`frame-padding.ts`.** `const forced = getForcedTripLayout(); const wide = forced ? forced === 'desktop' : width >= DESKTOP_BREAKPOINT`. With no override, the numeric-width behaviour is unchanged (test both).

**`safe-area.ts`.** Probe style `padding-top: var(--safe-top, env(safe-area-inset-top, 0px))`. Nothing else changes; `resetSafeAreaProbe`/resize invalidation stay.

**`AboutThisTrip`.** Keep the existing predicate (`!readOnly` + the `complete`/`saved_with_gaps` status allowlist) **and** require `feedback !== null`. Widen the prop types to `FeedbackComposer | null` through `MobileTripViewProps`/`TripPanelBody`. The existing website tests (`AboutThisTrip.test.tsx:46-55, 97-110`, which omit `feedback`) must pass **unchanged**. Don't touch any class string.

**Tests (red first):**
- `accessToken` without env gives `hasToken` true.
- Import rejection / constructor throw / pre-load error → `onError` once with a fixed string. Post-load error → no call.
- Unmount while the import is pending gives no `onError` and no map.
- `forceTripLayout('mobile')` re-renders a mounted reader at a 1280 px viewport without a resize; `null` restores.
- `frame-padding` at width 1280 with forced mobile gives non-wide padding; with no override, it is unchanged.
- An import failure, then a later acquire, retries.
- The safe-area probe reads `--safe-top` when set and `env()` otherwise.
- AboutThisTrip with `feedback={null}`, `readOnly` false and status `complete` shows no feedback row and no "Sample" copy. With `feedback` omitted, the row shows as today.

**Run the website suites:** `NODE_OPTIONS=--no-experimental-webstorage npx vitest run components/map components/trip lib/trip`. Same baseline count plus the new cases. Confirm the v3 sha256 is still OK (the reviewer verified v3's bundle imports none of these modules).

### Task 3: Library bundle can build the map stack
**Files:**
- `mcp-app/vite.config.ts`
- `mcp-app/scripts/emit-module.mjs`: publish the library to **both** `library/v1` and `library/v2`
- `mcp-app/library/library.css`
- `mcp-app/library/stubs/next-link.tsx`
- `mcp-app/library/stubs/TripFeedbackPanel.tsx` (keep every export name, including `buildDraft`)
- `package.json`: drop the probe from `build:widgets`
- `mcp-app/tsconfig.json` and `check-casts.mjs`: drop `probe`
- Delete `mcp-app/probe/`

**Changes:**
- **Vite plugin** (`enforce: 'pre'`, `resolveId`), applied when `name === 'library' || command === 'serve'` so the dev preview gets it too. The itinerary build never imports these modules, so v3 bytes are unaffected.
  - Resolve with `this.resolve(source, importer, { skipSelf: true })` and compare the normalized file path (no recursion).
  - Any import whose **resolved path** ends in `components/trip/TripFeedbackPanel.tsx` → the stub (returns `null`; same export names).
  - `next/link` → the stub: a plain `<a>` forwarding `href`/`className`/`children`/`onClick`/`aria-*`. Never rendered by the widget; it only stops `process.env.__NEXT_*` module-scope reads.
  - **No blanket `process.env` define.** Add a `define` key only for an env read a browser load proves still crashes, with a one-line comment.
  - TypeScript still sees the real modules; no tsconfig path aliasing.
- **`library.css`:**
  - `@source` for `../../components/map` and `../../components/trip` root files used.
  - Copy ONLY the globals.css rules the stack needs. **`.shared-map` (`globals.css:955-973`) is copied UNSCOPED**: MapProvider renders it as a sibling *outside* every `[data-library]` element, and library.css is the library's own file.
  - `.paper-scope`/`.mobile-trip`/`.surface` only if the preview proves them missing (scoped under `[data-library]`).
  - Sheet safe-area overrides: replace `env(safe-area-inset-bottom)` uses (`MobileTripSheet.tsx:91,104`) with `var(--safe-bottom, 0px)` via scoped selectors.
  - The map-view overlay is `pointer-events-none`; interactive children get `pointer-events-auto` (as `TripWorkspace.tsx:482`).
- **Verify:**
  - `npm run build:widgets` passes.
  - v3 sha256 OK.
  - Library bundle size reported.
  - LEAKS scan and `check:widget-casts` pass.
  - The browser load gate runs at the end of Task 5, once `main.tsx` imports the real view; a gate here could only test a tree-shaken graph.

### Task 4: `TripMapView` — viewer state owner composing the website's mobile trip view
**Files:** create `mcp-app/library/TripMapView.tsx` and `mcp-app/library/__tests__/TripMapView.test.tsx`.

**Props:** `{ data: WidgetData; onBack(): void; onDayChange(s: WidgetDayState): void }`. The map comes from the library-root `MapProvider` via `useSharedMap()`; there is no provider per open.

**Mirror `TripWorkspace` (`components/trip/TripWorkspace.tsx:105-133, 207-232, 276-444`)** with a header comment citing those lines.
- **State:** `activeDayNumber` (number, from `initialDayNumber`, which is non-null because zero-day trips never reach this view), `selectedPlaceId`, `selectedHotelId`, `layerMode`, `expanded`/`panelOpen` → `sheetState`, `selectedRestaurantPlaceId`, `mobileList`, `focusNonce`/`fitNonce`/`show3dNonce`, `mode3d`, **`revealRequest` + `revealWith` via the pure `planReveal`** (a pin on another day switches day and scrolls the stop into view).
- **Derivations:** the same `lib/trip/selectors`.
- **Dropped:** tabs, feedback, registry, generation.

**`onDayChange`** fires from an **effect on `activeDayNumber`** (skip the initial value; the library already pushes context on open), so pin-driven day switches update model context too.

**Render** (overlay `pointer-events-none`, as TripWorkspace):
- `<TripMap …phone props/>`.
- `<MobileTripSheet heading={<SheetHeading …/>} header={<DateStrip …/>}>`.
- An honest **partial-view notice** when `data.truncated.stops || data.truncated.quotes` (reuse `ItineraryWidget`'s wording).
- `<TripPanelBody … readOnly={false} feedback={null} />`.
- A widget-local control strip:
  - "‹ All trips" back button: 48 px, top offset `max(12px, var(--safe-top, 0px))`.
  - `MapControlStack` with fit + 3D.
  - Report the strip's rect via the existing control-obstruction helper so camera framing clears it.

**Tests** (jsdom; mock `mapbox-gl` as `components/map/__tests__/TripMap.test.tsx` does; wrap in `MapProvider accessToken="pk.test"`):
- Renders title, day strip and stops for `MULTI_SOURCE_RESPONSE`.
- No "Sample" badge or feedback row.
- Day change updates the timeline and calls `onDayChange`.
- A **pin on another day** switches the day and calls `onDayChange`.
- A list tap selects.
- Back calls `onBack`.
- A truncated bundle shows the notice.
- A place without coordinates (including as the **first** place) renders, is listed, and the mapbox mock's `Map` constructor / `jumpTo` receives finite center coordinates.
- **A→Back→B twice:** the mapbox mock shows every marker/layer added for A removed before B's are added, and exactly one `Map` is constructed for the whole sequence (the shared map is reused).

### Task 5: Wire into the library
**Files:** `mcp-app/library/main.tsx`, `TripLibrary.tsx`, `state.ts` (if needed), and tests.

**Changes:**
- **Module top of `main.tsx`:** `forceTripLayout('mobile')`. Never reset; the bundle is only ever the library.
- **Token.** Read `_meta['astrail/mapbox_token']` (string starting `pk.`) from the entrypoint `toolresult`.
- **WebGL check.** Canvas `getContext('webgl2') || getContext('webgl')`, then release that probe context via `WEBGL_lose_context`. `mapboxgl.supported` exists too, but it needs the lazily loaded module.
- **One `MapProvider`, mounted once around `TripLibrary`** when a token exists and WebGL is ok. Pass `onError={() => latch()}`. Mount it once; never re-create it on later `render()` calls or later tool results.
- **Library-wide latch:** one `mapFailed` boolean in the closure. Once set, the library re-renders **without** the `MapProvider`; its unmount calls `map.remove()` once (assert it). Every detail then renders `WidgetView`.
  - Known minor: a latch while a trip is open restarts that trip's view on its initial day.
- **15 s backstop:**
  - Starts when a map detail first mounts and the map is not `ready`. Read `ready` via `useOptionalSharedMap()` (or an equivalent null-safe read), never `useSharedMap()`, which throws once the latch has removed the provider.
  - Cancelled on `ready`, on Back and on unmount.
  - Sets the latch on expiry.
- **`TripLibrary` detail** when the phase is `ready`:
  - `!mapFailed && hasMap && data.bundle.days.length > 0` → `<TripMapView key={detail.seq} …/>`.
  - Otherwise, today's back bar + `WidgetView`.
- **Host insets.** On `hostcontextchanged` with `safeAreaInsets`, also `window.dispatchEvent(new Event('resize'))` so the safe-area probe and Mapbox recompute.
- **Model context.** `pushContext`, the removal guard, the stale-seq guard and `contextRemoved(params)` are unchanged.
- **Tests:**
  - Token + WebGL → map view.
  - No token / no WebGL / zero-day → `WidgetView`.
  - `onError` latches; the provider unmounts (`Map.remove` once) and later opens use `WidgetView`.
  - The backstop timer fires, and is cancelled on ready/back/unmount (fake timers).
  - Back returns to the list.
  - One `Map` is constructed across A→Back→B.
  - The existing race/removal tests stay green.
- **Mandatory browser load gate (no token needed):**
  - Run `npm run build:widgets`.
  - Serve a minimal HTML page containing `<div id="astrail-library-root">` and the **built** `public/mcp-widget/library/v2/library.{css,js}`; the module self-mounts.
  - Load it in headless Chrome (Playwright from `/tmp/astrail-qa`, system Chrome).
  - Assert **zero `pageerror`** (no "process is not defined") and that the loading skeleton or list region renders.
  - Record the output in the report.

### Task 6: Preview QA, handoff, final gates
- **Preview.** `library/preview.tsx` puts `import.meta.env.VITE_MAPBOX_PREVIEW_TOKEN` (dev-only) into the entrypoint result `_meta`.
- **Run.** Get the token value from `/Users/shaunliew/Projects/astrail/frontend/.env.local` (`NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN`) **without printing it**, then run in tmux: `VITE_MAPBOX_PREVIEW_TOKEN=… npx vite --config mcp-app/vite.config.ts --port 5179`.
- **Playwright** (system Chrome, `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`):
  - 390×844 mobile (isMobile, DPR 3; host insets top 47 / bottom 34): list → trip (map + compact sheet), expanded sheet, Day 2, a pin tap, stay view.
  - 1280×800.
  - `?theme=dark`.
  - Assert zero pageerror/console errors, no horizontal scroll, controls ≥ 48 px, the back button below the 47 px inset, and that the map **canvas is non-zero and fills the viewport** (bounding box ≈ window size).
  - **Old-CSP run.** The same preview with `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">` injected. Assert the `onError` latch fires and `WidgetView` renders with no pageerror. This proves cached v1 hosts degrade gracefully.
  - Save to `/Users/shaunliew/Projects/astrail/.gstack/qa/mcp-trip-map/`.
  - If the token is unavailable, run the no-token fallback screenshots and report "map QA blocked"; never fake it.
- **Handoff:** update `docs/deploy/2026-10-02-mcp-extensions-handoff.md`:
  - v2 resource and Refresh.
  - v1 kept (cached → static fallback) until a cache policy is decided.
  - The token is `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` on Vercel production (present; the probe used it).
  - Fallback/latch behaviour.
  - The probe removed (a cached host may show "unknown tool" until Refresh).
  - The bundle size.
  - **Rollback is a kill switch, not a revert.** Set Vercel env `MCP_LIBRARY_MAP=off` and redeploy. The entrypoints then omit the token, and every client falls back to `WidgetView`. Both resource URIs and both asset paths stay published; a revert would delete the v2 assets that cached v2 shells still load.
- **Final gates:**
  - Full `vitest`, `npm run typecheck`, `check:widget-casts`, `build:widgets`.
  - v3 `shasum -c` against the Task 1 baseline.
  - Task 5's browser load gate again.
  - `next build` with `NEXT_PUBLIC_BACKEND_URL=https://backend.example.invalid`.
  - The website suites for the five seams.

## Execution
- SDD: one `astrail-developer` per task (Sonnet; Opus for Tasks 2 and 4).
- An `astrail-reviewer` gate per task.
- A final whole-branch Claude review on the most capable model.
- One Codex cross-model review via Herdr pane `mcpext` (review only).
- Stop at local commits; the controller pushes and opens the PR.

## Deferrals
| Deferred | Trigger |
|---|---|
| Desktop floating-panel layout | Users find the full-width phone sheet awkward on wide Desktop |
| Remove `ui://astrail/library-v1.html` + `/library/v1/` | An explicit host-cache/refresh policy is accepted (no evidence caches expire in one release) |
| Live map in the inline v3 card | Demand for maps inside chat answers (v4 card; bundle size) |
| Feedback / regenerate / edit / hotel choice | A remote write-tool design, and Render deploys healthy |
| Restore-on-remount of the selected trip | Live test shows mobile panels remounting |
| Post-load fatal map error fallback | Seen live (today only pre-load errors fall back) |

## Review folds (rev 1 → rev 2)

**Codex:**
- P1-1: cached v1 compatibility. v1 is kept with its old CSP, and the latch falls back.
- P1-2: the forced layout reaches frame-padding, the layout store notifies, and the width cap is dropped.
- P2-1: host-inset bridge.
- P2-2: `resolveId` stub.
- P2-3: `onError` + latch + timer cleanup + async tests.
- P2-4: zero-day falls back; truncation notice; first-place-without-coordinates test.
- P3: already-exported components; seams listed up front; network wording; ponytail path.

**Claude:**
- B1: `next/link` + feedback-panel stubs, plus a mandatory browser load gate.
- M1: no export edits.
- M2: `readOnly` is "sample" → feedback-absent seam, `readOnly={false}`.
- M3: keep reveal; `onDayChange` from an effect.
- M4: force the layout at module init.
- M5: `onError` + library-wide latch.
- M6: one `MapProvider` at the library root.
- M7: sheet safe-area CSS.
- Minor:
  - 48 px rule exemption for `.shared-map`.
  - No `mapboxgl.supported`.
  - `pointer-events-none` overlay.
  - Fresh v3 baseline.
  - `.env.local` absent from the worktree.
  - Test via mapbox mocks instead of spying on `acquire`/`release`.

## Review folds (rev 2 → rev 3)

**Codex round 2:**
- P1: rollback via the `MCP_LIBRARY_MAP=off` kill switch; keep v1 and v2 published.
- P2-1: the browser gate runs on the real built graph at the end of Task 5 (and Task 6); `resolveId` uses `skipSelf`.
- P2-2: `feedback: FeedbackComposer | null`; keep the status allowlist; `SheetHeading` untouched.
- P2-3: the latch unmounts the provider (`remove()` once); the loading flag resets on failure.
- P3:
  - Explicit `getForcedTripLayout()`.
  - `mapboxgl.supported` exists (the canvas check is kept, and its probe context is released).
  - The first-unlocated-place test asserts a finite center.

**Claude round 2:**
- N1: `.shared-map` CSS unscoped, plus a canvas-fills-viewport assertion.
- N2: the plugin is active for `command === 'serve'`.
- N3: `feedback === null` sentinel; existing website tests pass unchanged.
- m1: built-bundle gate via a minimal HTML page.
- m2: noted.
- Ponytail: dropped `map-stack.ts`, the `SheetHeading` seam and the 48 px exemption.
- Added an old-CSP Playwright run for cached v1.

## Review folds (rev 3 → rev 3.1)
- Codex r3 and Claude r3 both flagged `TripPanelBody` → `DesktopAbout` nullable forwarding. Fixed with `p.feedback ?? undefined` inside the authorized MobileTripView seam.
- Claude r3: backstop reads `ready` null-safely after the latch; kill switch documented in the handoff doc.
- Codex r3: kill-switch wording corrected to "newly opened".
- Scores: Claude 7.5 PASS; Codex 6, with that single type gap as its only P2.
