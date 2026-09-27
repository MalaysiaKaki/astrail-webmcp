# Mobile trip view (Grab-style) + landing fixes

Status: v2, revised after Codex plan review v1 (6/10) and Shaun's redirect · Planner: Claude Opus 5.5 · Plan verifier: Codex · Implementer: Claude (Herdr pane)

## Outcome

On a phone (< 768 px, the existing `md` split), the trip page (`/app/trip/[tripId]`, `/app/trip/demo`) is its **own minimal view focused on the generated trip**. It is not the desktop panel squeezed into a sheet. The map is paired with a stop-by-stop itinerary, the way Grab pairs its map with a route. Desktop (≥ 768 px) keeps today's left rail and information density unchanged.

The landing page (`/`) gets only the fixes that make it render correctly on a phone. It is secondary.

## Decisions (Shaun, 2026-09-27)

- **Focus:** the trip page first. Use `/app/trip/demo` as the working and QA target.
- **Ownership:** Shaun owns this frontend revamp directly. A design revamp is in scope for mobile.
- **Direction:** mobile is different from desktop: minimal, trip-first, Grab-like map + itinerary.
- **Authority:** commit each phase on `feat/mobile-view` (a git worktree off `feat/webmcp` HEAD) and push the branch. No PR, no merge.
- **WebMCP dock on phones:** one collapsed chip by default; tap opens it as an overlay.
- **Landing Challenge banner on phones:** one line, not sticky (it scrolls away).

## Why desktop-in-a-sheet fails (evidence)

- **Stacked context before the stops.** Today's mobile sheet (`TripWorkspace.tsx:400-412`, 42dvh/82dvh) stacks, in order:
  - handle
  - "All trails"
  - demo badge + paragraph
  - `OrchestratorSummary` (prose + stats)
  - preference note
  - `TradeoffPanel`
  - only then day chips and `ItineraryCards` (`:446-492`)

  At 390×844 the first screen is all context and no stops.
- **The WebMCP dock sits on the sheet.** It is a sibling in `app/app/layout.tsx:26`, `fixed bottom-0 z-40`, and a collapsed dock renders two chips (`FoldedPill` + `WebMcpStatus`: `WebMcpDock.tsx:176-199,225-248`).
- **Small targets and text:**
  - 6 px drag handle (`TripWorkspace.tsx:451`)
  - 28 px toggles (`:432`, `:599`)
  - 9–10 px labels across panel children (`ItineraryCards.tsx:180,237,365,386`, `HotelPanel.tsx:78,84`, `AgentDecisionRail.tsx:34`, `DaySelector.tsx:43`)
- **The camera assumes a fixed 42% sheet.** `TripMap.framePadding()` hardcodes mobile bottom padding to `canvasHeight*0.42+32` (`TripMap.tsx:705`). It ignores the sheet's real height and its hidden state. A pin click expands the sheet to 82% (`TripWorkspace.tsx:311`) while the camera still pads for 42%.
- **Summary badge overflow.** The trip summary card was clipped at 390 px in the baseline (`/private/tmp/astrail-mobile-baseline/demo.png`). The non-shrinking gaps badge (`OrchestratorSummary.tsx:50-62`) is the likely cause; Phase 0 confirms it.

## Mobile trip design

The layout is **map on top, sheet below, itinerary as a timeline.**

```
┌──────────────────────────────┐
│ ‹  Tokyo · Sep 18–19   [≡ ⌖] │  floating top bar: back, compact title pill, layer toggle
│                              │  (safe-area-inset-top)
│         MAP (pins,           │
│         numbered route)      │
│                   (✦ agent)  │  single WebMCP chip, sits on the sheet's top edge
├──────────── ▬▬ ──────────────┤  44 px grab area (tap = toggle height)
│ Day 1  Day 2  Stay           │  sticky segmented chips (days + hotel)
│ ● 1  Senso-ji        9:00    │  timeline: numbered dot, name, time
│ │    Temple · "caption…"     │  one-line evidence quote (verbatim, truncated)
│ ┆  🚶 12 min                 │  transport leg between stops
│ ● 2  Nakamise St.    10:30   │
│ │    …                       │
│ ── About this trip ›         │  summary, preferences, tradeoffs, agent decisions,
│                              │  feedback: collapsed at the end
└──────────────────────────────┘
```

**Sheet: two heights plus hide**
- Compact is about 45dvh; its first screen shows the day chips and at least two stops.
- Expanded is about 88dvh.
- Hide/reopen stays; the reopen pill clears the safe area.
- The grab area is a 44 px button. Tap toggles the height; keyboard and ARIA parity are required.
- Handle-only drag is optional polish, not an acceptance item.
- The inner list scrolls natively.

**Compact header**
- Title and dates live in the floating top pill, not the sheet.
- Trip stats become one line under the day chips ("5 places · 2 days · 3 legs").
- The gaps badge wraps instead of overflowing.
- The demo "Sample trail — read-only" notice becomes a small tag in the top pill.

**Stops**
- A new mobile timeline built from the same data `ItineraryCards` uses.
- Each row: order, name, time or slot, category, and a one-line verbatim `evidence_caption_quote` (the evidence contract stays visible, only truncated).
- Transport legs sit between rows (data from `TransportStrip`).
- Tap a row: select the place (existing selection state → map flies to the pin) and expand the row inline. The inline row shows the full evidence quote, place intel, and restaurant suggestions.

**"Stay" chip**
- Swaps the list to the hotel view (existing Route/Hotel layer state).
- Reuses `HotelPanel` content with the mobile text and target minimums.

**"About this trip"**
- A collapsed section at the end of the list holding:
  - `OrchestratorSummary` prose
  - `TripPreferenceNote`
  - `TradeoffPanel`
  - `AgentDecisionRail`
  - `TripFeedbackPanel` (real trips only)
- Nothing is deleted; only the order and the default disclosure change.

**Minimums on mobile**
- Hit areas ≥ 44×44 px.
- Body text ≥ 14 px.
- Labels ≥ 12 px.
- Tokens come from `palette.css`/`type.css`; no new brand colours.

**Component structure**
- New files under `frontend/components/trip/mobile/`, for example:
  - `MobileTripView`
  - `MobileTripSheet`
  - `StopTimeline`
  - `MobileTopBar`
  - `AboutThisTrip`
- `TripWorkspace` keeps all state (selection, day, layer, sheet, `TripTools` wiring) and renders either the existing desktop rail or `MobileTripView`.
- Mounting constraints the implementer must satisfy:
  - Do not mount both trees at once; the children have effects.
  - No hydration mismatch.
  - No visible desktop flash on phones. Rendering nothing until the width is known is acceptable, because the page is already client-fetched.
- Desktop children must behave the same. Shared children may gain mobile-only classes.

## Shared geometry contract (fixes Codex v1 #1, #2)

- **One signal.** Add one route-scoped sheet-obstruction signal: the pixels the sheet covers at the bottom, 0 when hidden or when there is no sheet. It lives in `frontend/lib/trip/` as a tiny external store (`useSyncExternalStore`).
- **Who writes it.** `MobileTripSheet` measures itself (ResizeObserver plus state) and writes the value. It resets to 0 on unmount.
- **Map camera.** `TripMap.framePadding()` uses the signal on mobile instead of the fixed 42%. The existing safeguard against padding larger than the canvas stays. A height change re-applies padding (`easeTo` with padding), not a fresh fly-to on every frame. Leaving the trip route resets the padding on the persistent shared map.
- **Dock chip.** The collapsed chip sits at `obstruction + 12px` on mobile, and at the safe-area bottom when the value is 0 (e.g. `/app/trips`, loading, failed). The expanded dock is its own bounded overlay (max about 80dvh, internal scroll, reachable close) and is not offset by the sheet. Transparent wrappers keep `pointer-events: none` so the map still takes touches.
- **Map usable area.** In the expanded (88dvh) state the map is not considered usable. Selecting a stop there does not promise a visible pin; the pin is framed when the sheet returns to compact.

## Dock and approvals on mobile (fixes Codex v1 #5, #6, #7)

**One chip**
- A single chip merges `FoldedPill` and the `WebMcpStatus` count.
- Unread/change announcements and the unsupported-browser state keep a visible, deliberate placement.

**Collapse state**
- The mobile default is a layout default, not a stored preference.
- The stored `localStorage` collapse value only records explicit user actions.
- A mobile default never writes to storage, so desktop visits are unaffected.
- Once the user expands or collapses on this page, that choice holds across resize and rotation.

**Stays out of the dock refactor**
- Tool registration, `GlobalTools`, `TripTools` and the registry provider remain outside it.
- Tool names and schemas are unchanged.
- Tools selecting a day or place may open the sheet to compact; they never auto-expand the dock.
- `show_on_map(target: trip)` still does not move the camera.

**`AgentConfirm`**
- Both variants (plain confirm and the preference-input card) are sized to available space with `max-h` + scroll, and their actions stay reachable.
- They stay above the dock overlay and are independent of whether the dock is folded.
- Initial focus goes to the card. Dismissing it never authorizes the action.

## Landing (secondary, fixes Codex v1 #4, #8)

- **Banner on phones:** one line ("WebMCP Challenge build · See a finished trip →"), not sticky, ≥ 44 px tap target.
- **Nav on phones:** `StoryNav` becomes `position: sticky` placed after the banner in normal flow. It has no stale `--challenge-banner-h` offset. Desktop keeps the fixed nav with the measured offset.
- **Hero:** fix the right-edge clipping found in Phase 0 (measure the clipping ancestor before fixing it).
  - clamp type
  - stacked full-width CTAs
  - nav CTA ≥ 44 px
- **Landing map:** it is already `interactive: false` (`StoryRevealMap.tsx:37`), so no gesture change. Verify that native scroll passes over it.
- **Sections below the hero:** overflow and legibility fixes only.

## Phases

Each phase is one commit on `feat/mobile-view`. Run the relevant existing vitest files every phase.

**Phase 0: QA harness and baseline** (scratchpad only; time-boxed to about 30 min for GPU)
- **Browser:** a browser that renders Mapbox. Options: rebuild gstack browse, or headless Chrome/CDP with SwiftShader. If the map cannot render, record that as a QA limit.
- **Harness script:** a CDP or `$B` script. Per route × viewport it:
  - waits for fonts, map load and camera settle;
  - takes a screenshot;
  - reports document overflow (ignoring the intentional day-chip scroller and the off-screen hidden sheet);
  - lists clipping ancestors;
  - runs `elementFromPoint` hit tests at named control centres, with hit-box sizes;
  - reports whether the last list item can scroll into view.
- **Viewports:**
  - 360×640 (short)
  - 390×844
  - 430×932
  - 844×390 (landscape)
  - 1024×768 and 1440×900 (desktop baseline)
- **Environment:** inject the WebMCP shim before mount (see memory `astrail-headless-qa-of-webmcp-ui`) so the dock, rail and confirm actually render.
- **Output:** save the desktop baseline screenshots for later comparison. Confirm the causes of the landing clipping and the summary overflow.

**Phase 1: Global**
- `viewport` export: `viewportFit: 'cover'` and `themeColor`. Device-width is already Next's default.
- Safe-area insets applied only on the controls that need them (top bar, reopen pill, dock chip, confirm).

**Phase 2: Mobile trip view.** The main work; a single commit that includes the geometry contract.
- Add the `components/trip/mobile/*` components and the `TripWorkspace` branch between desktop and mobile.
- Wire the geometry signal into `TripMap`.
- Unit tests:
  - the geometry store (write, reset on unmount, hidden = 0)
  - `framePadding` for obstruction values, including the canvas-overflow guard
  - the `StopTimeline` render: evidence quote present, and tapping selects the place
  - the desktop/mobile branch

**Phase 3: Dock and approvals on mobile**
- Single chip, collapse-default semantics, `AgentConfirm` sizing and focus.
- Update `WebMcpDock.test.tsx` mobile expectations; keep the desktop defaults and storage-failure tests.
- Tests: fresh storage, stored collapse, storage throws, mobile↔desktop, route `/app` → trip, `/app/trips` with no sheet.

**Phase 4: Landing phone fixes**
- Banner, sticky nav, hero overflow, sections.
- Browser check: load, partial scroll, banner gone, scroll back, anchor link.

**Phase 5: Real-trip states and shell smoke check**
- Render loading, not-found, failed, generating/draft, gaps, long title/summary, many days/stops, no-hotel and feedback (keyboard open) with fixtures or mocked API. No paid generation, no local backend.
- `/app/trips` long-list scroll: suspect `(shell)/layout.tsx:17-19`. Change it only if the scroll actually breaks.
- Create/onboarding/saved-reels: fix overflow only.

**Phase 6: Verify and review**
- In `frontend/`, run `npx tsc --noEmit` and `npx vitest run`. There is no `lint` script, so `next lint`/eslint is run only if configured, and reported as absent otherwise.
- Full harness matrix, plus the desktop comparison at 1024/1440 with matching storage and support state. Check around the 640/768/820/1024 breakpoints.
- Final Codex diff review.

## Acceptance criteria

1. **Mobile layout at every mobile viewport in the matrix.** At 390×844 on first load of `/app/trip/demo`, the map is visible above the sheet. The sheet shows the day chips and at least two stops, each with a visible evidence quote. No agent UI overlaps the sheet except the single chip on its top edge.
2. **Selection framing.** In the compact state, selecting any stop (list tap or map pin) puts that pin on screen above the sheet and clear of the top bar and chip.
3. **Sheet coverage.** Every day, stop, hotel and "About this trip" item is reachable. The last item scrolls fully into view in the expanded state.
4. **Hit areas.** Every named control hit-tests as itself at its centre, with a ≥ 44×44 px hit area:
   - sheet grab, hide, reopen
   - day/Stay chips
   - stop rows
   - back
   - layer toggle
   - dock chip, dock close
   - prompt dismiss
   - approve, decline
   - landing banner, nav CTA and hero CTAs
5. **Type minimums.** Body text ≥ 14 px and labels ≥ 12 px inside the mobile trip view.
6. **Dock behaviour.** The dock stays folded to one chip on mobile until tapped. Expanded tools and history scroll and close. Both approval variants keep their actions reachable at 360×640 and with the dock expanded. A mobile default never changes desktop's stored state.
7. **Tool lifecycle.** With the shim:
   - Tool names and schemas and the registration count stay stable across sheet toggles, dock fold/unfold, resize and route changes.
   - The demo has 6 tools.
   - `show_on_map` works while the dock is folded and the sheet is hidden.
   - The signed-in 17-tool count is checked through existing tests, since a real session is not available headless.
8. **Landing.** At 360, 390 and 430 px there is no document overflow. The banner is one line and scrolls away. The nav has no stale gap after scrolling. The hero headline and both CTAs fit at 390×844.
9. **Desktop.** The 1024/1440 trip and landing screenshots match the Phase 0 baseline in equivalent state.
10. **Checks.** `tsc` and `vitest` are green, and new logic has tests.

## Amendments from Codex v2 review (7/10; these override the sections above)

1. **Data honesty (High).**
   - The frontend has `evidence_json.quote` (nullable), not `evidence_caption_quote`, and no clock times, slots or dwell.
   - Stop rows therefore show provenance per stop:
     - a verbatim Reel quote when present
     - a labelled "You asked for this" for user-requested stops
     - the rationale for suggestions
     - an honest "no caption evidence" state otherwise
   - No times. The sketch's `9:00` is replaced by the category or provenance tag.
   - Tests cover mixed provenance and a missing quote. No backend change, no invented schedule.
2. **Stay.**
   - Show the Stay chip and the layer toggle only when hotel rows exist.
   - Hotel details render even if the hub has no coordinates.
   - Hub map mode only when the existing coordinate predicate passes.
   - The list view (stops/stay) is separate state from the map layer (`route | hub`). Picking a day chip returns to route.
   - Cover the hotel fixture and an unresolved-hotel fixture.
3. **Transport legs.**
   - Reuse or extract `buildRouteLinks()` from `ItineraryCards.tsx:39-65`.
   - Keep cross-day arrivals, trailing legs and no-route warnings.
   - Show duration only for successful routes.
   - Keep the global `trailNumbers` so row numbers match the pins.
   - Regression test: the demo's cross-day/no-route leg.
4. **Lifecycle.**
   - `TripMap` driver and `TripTools` stay mounted outside the desktop/mobile branch.
   - New hooks go before `TripWorkspace`'s early returns.
   - The seeded demo renders on first paint, so choose the branch without a desktop flash (CSS-gated shell or a synchronous client-width read). Document the choice.
   - The geometry store:
     - publishes a primitive number
     - has a deterministic server snapshot
     - publishes 0 explicitly on hide
     - debounces animation measurements
   - Padding updates must not interrupt a selection `flyTo`.
   - Going mobile→desktop restores desktop padding.
   - Test: initial load, hidden→compact tool select, expanded→compact, rapid toggles, 767↔768 resize, route exit, Strict Mode.
5. **Selection.**
   - On mobile, a pin click selects and keeps the sheet compact; desktop keeps its current behaviour.
   - Pin-framing acceptance covers located stops only; unresolved stops open their detail with "location unavailable".
   - Re-tapping the selected row re-frames the map.
6. **Preserve content.**
   - A per-day disclosure holds `DayOverview` (title, narration, weather, rewrite status).
   - Every day's restaurant suggestions stay reachable, including unanchored ones, with selection/map wiring intact.
   - Feedback keeps its existing complete/saved-with-gaps allowlist.
7. **Tool lifecycle acceptance (replaces criterion 7's route wording).**
   - No registration churn across sheet/dock/breakpoint changes on the same route.
   - Correct unregister/register when navigating away or between public and authenticated routes.
   - Exercise real registered callbacks with the shim.
8. **Gating.**
   - Minimal dock-chip placement lands in Phase 2 so Phase 2 can meet criterion 1; Phase 3 finishes the dock.
   - Expanded-state hit tests at 360×640 include chip vs back-button/top-bar clearance. In expanded state the chip may sit inside the sheet header instead.
   - 844×390 landscape is ≥ 768 wide, so it gets the desktop layout by design.

## Constraints and limits

- **Out of scope:** backend, schema, SSE, API, `backend-types.ts`, Vercel config, `NEXT_PUBLIC_*`.
- **Evidence contract:** every stop still shows its verbatim caption evidence. Truncation is visual only; the full quote is on tap.
- **Known QA limits:**
  - Headless QA cannot prove iOS Safari URL-bar, keyboard or safe-area behaviour; this is reported as pending a real-phone check by Shaun.
  - The signed-in 17-tool state is verified by unit tests only.
