# Placify web revamp, phone bottom nav, 3D controls, challenge removal

Status: draft for Shaun's approval · Planner: Claude Opus 5.5 · Plan verifier: Codex · Implementers: three Claude sessions in Herdr tabs · Base: `feat/mobile-view` @ `6512a3e` (phone revamp, pushed).

## Requests (Shaun, 2026-09-29) and decisions

1. **Remove the WebMCP Challenge framing** from the landing page, the site metadata and the README. WebMCP and the agent stay as product features. Remove the banner and the judges panels. The sample-trip link moves into the hero.
2. **One shared type scale for phone and desktop.** Desktop moves up to the readable Placify scale; phone keeps it.
3. **Map zoom in/out plus a 3D view toggle,** visible on the trip map at every width.
4. **Phone app nav becomes a floating bottom-centre tab bar** with icon and label for four tabs: Home, Trails, Sample, Settings. Feedback and Log out move into the Settings page.
5. **Feedback opens Tally in a new browser tab** instead of a popup that stacks over pages and follows navigation.
6. **Desktop/web view aligns with Placify** like the phone view does, keeping the same sidebar (restyled, not replaced). This covers the landing page (`/`), the app home (`/app`, `/app/trips`, `/app/settings`) and the trip page. Use Mapbox capabilities where they help.
7. **Work split:** Herdr Claude tabs implement, Codex reviews. The current work is already committed and pushed (verified clean). Shaun's pre-existing `.claude/`/`.agents/` edits on `feat/webmcp` stay untouched.

## Design language (desktop extends the phone kit)

`frontend/app/mobile-ui.css` becomes the shared UI kit for all widths. The orchestrator owns it and renames it to `ui-kit.css` in one commit. The kit button and card classes are already width-agnostic.

**Additions the orchestrator makes before dispatch:**
- A shared type scale as tokens and utility classes:
  - `--t-display` 28–40px (serif, clamp)
  - `--t-title` 20–24px (serif)
  - `--t-card-title` 17px
  - `--t-body` 15–16px
  - `--t-meta` 14px
  - `--t-label` 12px, the minimum anywhere in revamped surfaces
- Desktop spacing and radii tokens.
- A `.ui-floating-panel` class for the desktop rail: a Placify-style frosted card panel with a 28px radius, inset from the viewport edges.

**Desktop layout principle:** Placify's map-first composition scaled up.
- A full-bleed map with floating circular controls on the right.
- A floating card panel on the left in place of the flush rail, with the same content model as the phone sheet.
- Marketing and app pages use white elevated cards on warm paper, serif headlines, and kit buttons.

**Tappability and clickability rule** (unchanged): every control is a kit type, a card link with a chevron, or a map pin. Every control is at least 44px, has a focus-visible state and a pressed state.

## Workstreams (three tabs, disjoint files)

### Tab A: trip page desktop revamp and map controls

- **Worktree / branch:** `astrail-mobile` on `feat/mobile-view`.
- **Port:** 3000.
- **Owns:** `components/trip/**`, `components/map/**`, `components/webmcp/**`, `lib/trip/**`, `lib/webmcp/**` (UI state only, tool contracts frozen), and their tests.

**A5. Map zoom and 3D controls, all widths**
- Add zoom-in, zoom-out and a 3D toggle to the circular button stack, and add the same stack on desktop.
- 3D on:
  - ease to pitch about 60, keeping the current bearing and centre
  - enable Mapbox terrain: `raster-dem` source `mapbox://mapbox.mapbox-terrain-dem-v1`, exaggeration about 1.3
  - sky/fog fitting the Standard style
  - the existing `astrail-3d-buildings` layer stays, visible from z15
- 3D off: ease back to pitch 0, and terrain is removed.
- The state is reflected by `aria-pressed` and persists for the trip session.
- Terrain and sky are removed when the map leaves the trip route, because it is a shared map.
- Reduced motion uses `jumpTo`.
- WebMCP tool contracts are unchanged; no new tools in this pass.
- Performance: terrain only while 3D is on.

**A6. Desktop trip layout**
- Replace the flush 440px rail with a floating left panel, `.ui-floating-panel`, about 420–460px, inset 16px, scrolling internally. It has the same content model as the phone sheet:
  - header
  - date strip
  - day sub-header
  - StopCard list with legs
  - "About this trip" grid and rows
  - Stay view
- Reuse `components/trip/mobile/*` by generalising them into width-agnostic components, instead of maintaining two trees. Remove desktop-only duplicates that the unified components replace, but keep every capability:
  - PlaceIntel and AgentDecisionRail content inside About or stop detail
  - OrchestratorSummary, TradeoffPanel, RestaurantStrip content and HotelPanel
- Desktop pins become the photo-avatar pins (unscope `phone-pins.css`).
- Desktop evidence popups become the light `phone-map-cards` style, or the selected card as detail, choosing the more consistent option. The existing "Zoom in for 3D" popup action maps onto the new 3D control.
- Collapse and reopen of the panel stay.
- Camera padding and geometry use the real panel rect (left obstruction) through the same obstruction-store pattern.

**A7. Desktop dock and approvals** get the light kit (`tone: 'paper'`) at all widths. The dock position is unchanged.

**A8. Type scale:** apply the shared scale across all trip surfaces at every width. Remove the `.mobile-trip` floor rule once components use the scale natively.

### Tab B: landing page, challenge removal and desktop revamp

- **Worktree / branch:** `astrail-mobile-landing` on `feat/mobile-landing`, rebased onto the new base.
- **Port:** 3002.
- **Owns:** `components/landing/**`, `components/story/**`, `app/page.tsx`, `public/landing-mobile/**`, `public/landing/**`, `README.md` (repo root), and landing tests.

**B5. Challenge removal**
- Delete `ChallengeBanner` and `ChallengePanels` (and their CSS in `story.css`). Their `globals.css` rules are removed by the orchestrator.
- Move the no-account sample-trip link into the hero, as a phone pill badge and a desktop secondary action: "See a finished trip, no account needed".
- Reword the title, hero eyebrow, hero body ("This build adds WebMCP…" → product framing), the "six on the sample trail linked at the top" sentence, StoryNav, footer, FinalCTA, the FAQ heading and "What is this?", and code comments.
- Repurpose ChallengePanels' seven feature bullets and the ChatGPT setup steps into a neutral "What the agent can do / Try it with an agent" section.
- README: remove the Devpost link, judge account, "What is new for this challenge" and the SUBMISSION/WHATS-NEW links. Retitle it as the product README.
- Tests:
  - rename `landing-hackathon.test.tsx` → `landing-contract.test.tsx`
  - delete the challenge/judges/Devpost assertions
  - keep the no-credential-leak and noindex checks
  - re-point the sample-trail link tests to the hero
  - update the phone tests that pin `.challenge-banner__*`
- `/classic` (old landing) is untouched.

**B6. Desktop landing revamp**
- Apply the Placify site language at ≥768:
  - a flat header that becomes a floating white card on scroll
  - a centred serif hero with the pill badge, dark and white pill CTAs, and a device-framed product screenshot
  - sections as white feature cards in a responsive grid, with product visuals in rounded frames
  - FAQ as card disclosures
  - footer as card links
- Desktop images come from the new desktop trip view, which the orchestrator captures after A6. Use a reproducible script; AVIF/WebP with a budget of 250KB each on desktop; lazy loading; Mapbox credit.
- Phone stays as is, apart from the challenge removal.

### Tab C: app shell, home, trips, settings

- **Worktree / branch:** new `astrail-app-shell` on `feat/app-shell`, cut from the new base.
- **Port:** 3004.
- **Owns:**
  - `components/dashboard/**` (Sidebar)
  - `components/reels/**`, `components/trips/**`, `components/settings/**`, `components/create/**`
  - `app/app/(shell)/**`
  - `lib/tally.ts`
  - their tests

**C1. Phone bottom tab bar**
- Below 768, the Sidebar's phone top bar is replaced by a floating, bottom-centred pill tab bar (Placify `appstore/05.png`) with four tabs: Home, Trails, Sample, Settings. Each tab has an icon and a label.
- The active tab has an ink icon and label in bold, and `aria-current="page"`.
- Safe-area bottom inset.
- Page content gets bottom padding so nothing hides behind the bar.
- The bar hides on trip routes, which have their own map chrome (trip pages are outside `(shell)`).
- Brand/logo: a compact top header on phones, or none; choose per the Placify reference.

**C2. Feedback and Log out move into Settings**
- Both become `m-card-link` rows in Settings.
- Feedback is an `<a href="https://tally.so/r/PdNreP" target="_blank" rel="noopener noreferrer">` card link with an external-link icon, and the same on the desktop sidebar.
- Log out keeps `signOut()` behaviour, restyled as a kit row.
- Remove `data-tally-open` usage. The orchestrator removes the Tally embed script from `app/layout.tsx` if nothing else uses it (Tab C reports), and updates any CSP entry.

**C3. Desktop sidebar restyle**
- Same structure and items: New trail, nav, Recent, trial pill, Feedback (new tab), Settings, Log out.
- Placify styling:
  - frosted card surface
  - rounded nav items with active pill
  - kit buttons, with New trail as `m-btn-primary`
  - shared type scale
- No structural change.

**C4. App pages, all widths**
- `/app` (SavedReelsFlow: TraysScreen, TrayCard, TrayDetail, LibraryPanel, dialogs, PlanSheet, CountryTrays): white elevated cards, serif titles, kit buttons, card links, and the shared type scale.
- `/app/trips` (TripsList + TripMapDashboard): Placify-style trip cards with photo avatars, and a map pane with the circular controls pattern.
- `/app/settings` (SettingsView, DeleteAccountCard): grouped card-link rows. The destructive action stays guarded.
- Behaviour, data calls and generation flow are unchanged. Onboarding is out of scope.
- **QA without sign-in:**
  - headless: stub `listSavedReelCards`, `listCollections`, `getMembershipsByCollection` and the trips fetch, plus a `middleware.ts` early return, in a working-tree-only swap that is never committed (see memory `astrail-headless-qa-of-webmcp-ui`)
  - the orchestrator also checks in Shaun's signed-in Arc when possible

## Orchestrator steps

1. Kit v2 commit on `feat/mobile-view`: rename to `ui-kit.css`, type scale, desktop tokens, `.ui-floating-panel`. Push.
2. Create the `feat/app-shell` worktree (clone `node_modules`, copy `.env.local`, port 3004). Rebase `feat/mobile-landing` onto the new base (Tab B does this on instruction). Start Tab C in a new Herdr tab.
3. Dispatch phases: A5 → A6 → A7/A8 · B5 → B6 · C1+C2 → C3 → C4. Review each phase with the harness (phone and desktop screenshots, overflow, hit targets, small fonts, flows) plus Arc when it is uncovered, and a Sonnet visual reviewer against the Placify references. Push after each verified phase.
4. Shared files owned by the orchestrator: `ui-kit.css`, `app/layout.tsx` (import rename, Tally script removal), `globals.css` (remove challenge-banner rules).
5. Integrate: cherry-pick B and C onto `feat/mobile-view` after checking for no file overlap. Regenerate the landing screenshots from the final trip view. Run the full gate on the combined branch. Codex final review, fix, Codex re-check. Push. No PR, no merge.

## Amendments from Codex plan review v1 (6.8/10; these override the sections above)

1. **3D is a camera mode, not a one-off move.**
   - `mapMode3d` (default **off**) lives in trip camera state.
   - Every trip camera command takes its pitch from the mode: initial fit, day, Fit, stop, restaurant, hotel, and WebMCP-driven selection. 3D is about 60, off is 0 (replacing the hard-coded 45/55).
   - The popup's old "Zoom in for 3D" action becomes "turn 3D on + fly to stop".
   - Tests: off/on followed by each command asserts pitch and terrain.
2. **Atmosphere and shared-map lifecycle.**
   - Use fog, not the sky layer (globe projection). Cleanup restores the previous fog config rather than removing it.
   - `TripMap` owns the DEM source id `astrail-dem`. Order is `setTerrain(null)` before `removeSource`.
   - A generation token cancels pending style/load callbacks, so an outgoing trip can never re-enable terrain.
   - Verify: repeated toggles; 3D trip → `/app/trips` → another trip; navigating before the style is ready; no duplicate-source errors; no DEM requests while off.
   - Buildings: check the live Standard style. Prefer its native 3D buildings (`show3dObjects` config) when available; keep the custom layer only as a fallback, never both.
3. **Control stack geometry.**
   - Phones: the zoom buttons are **not shown**, since pinch-zoom is native; this matches Placify. The 3D toggle joins the stack.
   - The maximum phone stack is agent, Fit, 3D and Hotel (4). If that collides with the compact sheet at a short height (≤700px), Hotel moves into the sheet's Stay chip and the stack keeps 3.
   - Desktop gets zoom +/− plus 3D and Fit.
   - The collision model in `frame-padding` uses the actually rendered control rects (measured), not a fixed count.
   - Tests at 360×640 and 390×844 with safe-area 0/47, hotels on/off, WebMCP on/off, sheet compact/expanded/hidden.
   - While the sheet is **expanded**, the phone stack shows **only the agent button**. 3D, Fit and Hotel hide, as they already do for Fit and Hotel. The collision tests include the expanded sheet's Hide button at safe-area 47.
4. **README evidence retention.**
   - Tab B owns `app/__tests__/readme-webmcp-contract.test.ts`.
   - The dated deployed-generation and `move_place`/`set_trip_dates` run evidence moves into a neutral "Verification" section.
   - The tool table, native registration and edit-flag contracts are kept, and that test stays green unchanged (or changed only for heading names, listed explicitly).
   - A mount/content test covers the new neutral "What the agent can do / Try it" section.
5. **Capability and test migration gate for A6.**
   - Before deleting any desktop trip component, Tab A writes a capability matrix (old component → new home) into its report. Covered: quote **and** rationale shown together, provenance, confidence (desktop keeps the confidence chip in stop detail; phone keeps it out), source links, legs, hotel comparisons, summary/trade-offs, restaurants, feedback, collapse/focus.
   - Superseded presentation tests are listed as intentional migrations, each with a replacement assertion.
   - `TripTools` and the map stay outside the responsive panel tree, and no remount happens on resize or About/Stay toggles (the registration-stability test is kept).
6. **Dock versus bottom tabs.**
   - On shell routes (`/app`, `/app/trips`, `/app/settings`) with the phone bottom bar, the folded agent chip sits above the bar: bottom = bar height + gap + safe area.
   - Approval cards stay above both.
   - Tab C publishes the bar's height through a tiny `lib/shell/bottom-nav.ts` store (C owns it; A reads it). This contract is fixed in C1 and delivered to A before A7.
   - Tests with WebMCP supported: dock folded and open, all four tabs hit-test.
7. **Settings rows stay reachable.** Feedback and Log out render outside the data-dependent section of `SettingsView`, so they work while profile/preferences are pending or have failed. Tests cover pending, rejected and the sign-out redirect. The headless fixtures include profile/preferences success and failure.
8. **Ownership and handoffs.**
   - The orchestrator removes the `.mobile-trip` type floor from `globals.css` after A8.
   - The reusable map controls (`MapControlStack` + the 3D camera-mode API) are frozen after A5. The orchestrator cherry-picks that commit into C's branch before C4, and it is tracked so integration skips it.
   - The orchestrator owns `next.config.ts` (no CSP change is needed for a new-tab anchor).
   - Tally: remove only the popup loader in `app/layout.tsx`. `WaitlistFormEmbed` (classic landing) keeps its own loader.
   - Desktop panel obstruction gets a separate **left** measurement (`lib/trip/panel-obstruction.ts`). The bottom-only sheet store and dock placement stay as they are.
9. **Breakpoint and runtime gates.**
   - The shell switches at **768** in both Sidebar and the shell layout.
   - The harness adds 640, 767, 768 and short landscape (844×390).
   - Last item hit-tested on each real scroll container, including the `/app/trips` full-bleed scroller with bottom-bar clearance.
   - A desktop `flows.mjs` variant covers About, Stay (with a hotel fixture swap) and the 3D toggle.
   - Terrain perf check: frame time over a 5s pan with 3D off versus on at 390×844 DPR2 in the harness, reported as numbers (informational, not a gate).

## Acceptance criteria

1. **Landing.** No visible "Challenge", "hackathon", "judges" or "Devpost" text, and none in `/` metadata or `README.md` (grep-verified). The sample-trip link is present in the hero with "no account needed" in its accessible name. WebMCP is described as a feature.
2. **Type.** Every revamped surface at every width uses the shared scale, with text ≥ 12px (harness font check at 360/390/430/1024/1440).
3. **3D and zoom.**
   - The zoom and 3D buttons work at every width.
   - With 3D on, the pitch is > 45 and terrain is present.
   - With 3D off, the pitch is 0 and terrain is removed.
   - Leaving the trip route removes terrain and sky.
   - Selection framing and geometry tests still pass.
4. **Phone nav.**
   - The bottom-centre pill has four labelled tabs and the correct `aria-current`.
   - It covers no content (the last item of each shell page is reachable).
   - It is hidden on trip routes.
   - Settings contains Feedback (new tab, `rel=noopener`) and Log out.
5. **Feedback.** No Tally popup remains. Feedback opens `tally.so/r/PdNreP` in a new tab from the sidebar and from Settings.
6. **Desktop.** `/`, `/app`, `/app/trips`, `/app/settings` and `/app/trip/demo` at 1024 and 1440 follow the kit (floating panel, cards, kit buttons, circular map controls). The Sonnet visual reviewer finds no High issues against the spec. No horizontal overflow.
7. **Behaviour.**
   - Every existing behaviour contract passes: trip selection, geometry, evidence contract, demo read-only, feedback draft semantics, WebMCP tool names, schemas, registration stability and approvals, landing no-credential and noindex.
   - `tsc` is clean, and `NODE_OPTIONS=--no-experimental-webstorage npx vitest run` is all green.
   - `flows.mjs` passes on phone and on desktop (a desktop flow variant is added).
8. **Reviews.** Codex final review scores ≥ 7 with no dimension ≤ 3, and its High findings are fixed.

## Out of scope and constraints

- No backend, schema, API, `backend-types.ts`, Vercel or `NEXT_PUBLIC_*` changes.
- No live generation.
- No new WebMCP tools.
- Onboarding and `/classic` are out.
- Placify patterns only; no copying of its assets.
- Stopping rules as before: DONE, PARTIAL (a phase parked after three failures, with dependants stopped) or BLOCKED (a permission pending). Never approve prompts on Shaun's behalf.
