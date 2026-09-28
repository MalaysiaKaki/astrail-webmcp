# Placify-style mobile revamp: trip page + home page

Status: draft for Shaun's approval · Planner: Claude Opus 5.5 · Plan verifier: Codex · Implementers: two Claude sessions in separate Herdr tabs · Runs unattended overnight after approval.

## Goal

On phones (< 768 px), Astrail's trip page and home page adopt Placify's mobile UI language (placify.app, App Store id6739698007). The target is a map-first trip view with elevated cards and controls that obviously look tappable, plus a clean, card-based marketing page. Desktop (≥ 768 px) stays pixel-identical.

We follow Placify's **patterns** (layout, card anatomy, elevation, button styles, spacing, motion). We do **not** copy its assets, illustrations, 3D icons, wordmark, copy or screenshots. Astrail keeps its own name, palette hues, fonts and imagery (Reel thumbnails, mascot).

## Reference

Research is in the scratchpad `placify/`:
- `TEARDOWN.md`
- App Store screens `appstore/01.png`–`06.png`
- site captures `site/*`
- computed styles `site/site-data-mobile.json`

Implementers read `TEARDOWN.md` plus `appstore/01, 02, 05` and `site/mobile-390x844-slice-00, 02, 05` before designing. Absolute path: `/private/tmp/claude-501/-Users-shaunliew-Projects-astrail/7d7b3cce-fcd5-4226-851d-86a3fe034f35/scratchpad/placify/`.

## Shared mobile design language

The orchestrator creates this before any implementer starts: `frontend/app/mobile-ui.css`, imported once in `app/layout.tsx`. Both tabs use it read-only. Proposed token values are adjusted to Astrail's palette.

- **Surfaces.**
  - Warm off-white page: Astrail `--paper`, or close to `#FBF7F3`.
  - White cards.
  - Nested sub-cards in a light warm grey.
  - Frosted translucency only on the sheet and the floating header.
- **Ink.** Near-black navy-ink for primary fills and headlines (Astrail's darkest ink token).
- **Accent.** Astrail's amber/brown stays for status, links and the selected day, used sparingly.
- **Radii.**
  - Cards 20 px.
  - Sheet top 28 px.
  - Nested sub-cards 16 px.
  - Buttons: capsule (999 px) for pills, circle for icon buttons.
- **Elevation, the main tappability signal.**
  - `--m-shadow-1` for cards: a layered soft shadow at 0.06–0.10 opacity.
  - `--m-shadow-2` for floating buttons and the header: stronger and layered, at 0.12–0.18.
  - No hard borders on elevated controls.
- **Type.**
  - Astrail's existing serif for display: trip title, day numbers, section headlines.
  - Astrail's existing sans for UI at 14–17 px, medium weight, slight negative tracking.
  - Minimum 12 px.
- **Button kit.** Utility classes `m-btn-primary`, `m-btn-secondary`, `m-btn-icon`, `m-card-link`:
  - **Primary:** ink-filled capsule, white label, `--m-shadow-2`, ≥ 48 px tall, press feedback (scale 0.97 plus a darker fill).
  - **Secondary:** white capsule with `--m-shadow-1` and ink label (not a bare text link), ≥ 44 px.
  - **Icon button:** 44 px white circle with `--m-shadow-2` and a line icon.
  - **Card link:** a whole card is tappable, with a trailing chevron and a pressed state.
- **Tappability rule.** Every interactive element on phone surfaces is one of the four kit types or a map pin. Bare coloured text is never the only affordance.
- **Motion.**
  - Sheet 300 ms ease-out.
  - Press 120 ms.
  - Everything respects `prefers-reduced-motion`.

## Tab A: trip page (`/app/trip/[tripId]`, `/app/trip/demo`), phones

Builds on the existing phone branch in `components/trip/mobile/*`. Keep:
- the geometry, selection, provenance and lifecycle logic
- all tests' behaviour contracts
- WebMCP tool names, schemas and behaviour

**Screen layout** (compare `appstore/01.png`, `02.png`)
- **Map** is full-bleed.
- **Top-left:** 44 px circular back button.
- **Top-right:** a vertical stack of 44 px circular buttons.
  - "Fit trip" (recentre on the day/trip), always shown.
  - The Route/Hotel layer toggle, only when hotels exist.
  - The agent button, only when WebMCP is supported; it carries an unread dot and opens the existing dock overlay. It replaces the current pill chip.
- **No long title pill over the map.** The title moves into the sheet.

**Map pins** (phone only)
- A circular photo avatar: the Reel thumbnail when present, otherwise a category glyph. White ring, soft shadow, and a number badge.
- The selected pin grows slightly and shows its name pill.
- The route line stays and follows the palette.
- If a pin change is too risky for the shared TripMap desktop markers, gate it by layout. Desktop markers stay byte-identical.

**Sheet: two detents plus hidden** (as today)
- Cream frosted surface, 28 px top radius, handle.
- **Header row:**
  - serif trip title (e.g. "Tokyo, Japan")
  - a muted date range and "Sample" tag below it
  - a 44 px circular "hide sheet" icon button on the right
- **Day strip, Placify style.** Each day is a column showing the date number in serif plus the weekday in small caps. The selected day is a filled rounded square in a warm tint. The strip scrolls horizontally, and "Stay" follows as the last item when hotels exist.
- **Day sub-header:** "Sep 18" in serif, a "Day 1" capsule, and the day title. The day overview disclosure becomes a card link.

**Stop card** (compare `appstore/02.png`)
- A white card, 20 px radius, `--m-shadow-1`.
- Dark ink number badge, bold title, and a muted category plus provenance line.
- A **nested evidence sub-card** (light grey, 16 px radius):
  - 56 px rounded Reel thumbnail on the left
  - the verbatim quote with typographic quote marks, 2-line clamp
  - honest states unchanged: "You asked for this", rationale, "No caption evidence"
- A trailing chevron shows the card expands.
- The selected card gets an ink outline ring and expands inline (address, Source link as a secondary button, nearby-eat cards).
- **Travel legs** sit between cards as a meta row: walk/drive/train icon, "3 min · 0.1 km", on a dotted connector. A no-route leg is one line with the train icon.

**About this trip**
- A 2×2 grid of stat cards (Places, Days, Legs, Distance when known), Placify overview style.
- Below it, card links for the summary, preferences, trade-offs, agent decisions, the "missing details" status, and feedback. Each opens inline.
- Feedback's controls use the button kit.

**States.** Loading, not-found, failed and generating screens on phones use the same card and button kit, with centred content and a primary pill action.

## Tab B: home page (`/`), phones

Keep all copy, the link targets and the landing contract tests. Layout, hierarchy and components may be redone on phones. Desktop stays pixel-identical.

**Header**
- **At top:** the Astrail wordmark on the left and a dark pill "Sign in to try it" on the right. It sits flat on the page, replacing the grey frosted blobs.
- **On scroll:** the header becomes a floating white rounded card (`--m-shadow-2`, 20 px radius, inset 12 px), as on placify.app (`site/mobile-390x844-slice-02`).

**Challenge banner → hero pill**
- On phones the dark banner is replaced by a pill badge above the headline: a green dot, "WebMCP Challenge build · See a finished trip", and a chevron.
- Same link target (`/app/trip/demo`) and the same accessible name meaning, so the landing tests' contract holds. Update the tests only if the DOM contract must change; flag it in the report.

**Hero**
- Centred serif headline, the lead paragraph, then a full-width primary pill (Sign in) and a secondary pill (See how it works).
- Then a **phone device frame showing a real screenshot of the new Astrail mobile trip view**:
  - It is a static image committed under `public/` and generated from our own app by the harness, at 2× DPR.
  - Tab B uses a first capture of the current phone view. The orchestrator regenerates it after Tab A lands.
  - The mascot stays and sits beside or overlapping the frame without covering text.

**Sections**
- Each story section on phones becomes a white rounded feature card (Placify's "Flyover View" cards), with a serif heading and body copy.
- Where a section has a product visual, it gets a device-framed crop.
- Long copy stays but moves into cards with comfortable measure and spacing.
- The dark "chapters" band keeps its content but uses the card layout.
- FAQ items become card links (disclosure with chevron).
- The footer uses card links.

## Execution

**Orchestrator (Opus, this pane)**
- **Before dispatch:** create `mobile-ui.css` with the tokens and button kit, wire it into `app/layout.tsx`, commit, push.
- **Dispatch:** give each tab its bounded phase prompts.
- **Per phase:**
  - run the harness (`run.mjs`, `flows.mjs`) plus a check in Shaun's Arc window at 390 px via AppleScript and `screencapture` (permissions granted)
  - desktop pixel diffs at 1024 and 1440 on both routes
  - send findings back to the tab
- **Push:** after each verified phase, on the owning branch.

**Tab A**
- Existing Herdr pane `mobile-impl`, context reset with `/clear`.
- Worktree `astrail-mobile`, branch `feat/mobile-view`.
- Owns `components/trip/**`, `components/map/**`, `components/webmcp/**`, `lib/trip/**`, trip tests.

**Tab B**
- New Herdr **tab** with a new Claude session.
- New worktree `astrail-mobile-landing`, branch `feat/mobile-landing` cut from `feat/mobile-view` after the token commit. Dev server on port 3002.
- Owns `components/landing/**`, `components/story/**`, `story.css`, `app/page.tsx`, `public/landing-mobile/**`, landing tests.

**Integration**
- Separate worktrees remove the shared-index risk (see memory `subagents-share-one-worktree`).
- Neither tab edits `mobile-ui.css`. They request token changes from the orchestrator.
- Once both are verified, the orchestrator cherry-picks the `feat/mobile-landing` commits onto `feat/mobile-view`. The file sets are disjoint, so this is a replay rather than a merge. Push both branches. No PR, no merge into dev/main.

**Phases** (each tab commits per phase; no pushes from tabs)
- **A1:** map chrome (back button, right button stack, agent button) and the sheet header, day strip and day sub-header.
- **A2:** stop cards with the nested evidence sub-card, travel legs, selected state.
- **A3:** map photo-avatar pins (phone-gated) and About this trip (stat grid and card links).
- **A4:** phone state screens, a polish pass against the Placify references, a11y and reduced motion.
- **B1:** header (flat → floating card), hero pill, hero with CTAs and device-frame screenshot.
- **B2:** section cards, FAQ and footer card links, the dark band.
- **B3:** polish pass against the Placify references; regenerate the hero screenshot after A4 (orchestrator).

**Reviews**
- **Claude visual reviewer:** a Sonnet subagent after each phase. It compares harness and Arc captures with the Placify reference images against this spec and the tappability rule.
- **Codex:** reviews this plan now. At the end it does one final code review per tab diff, then one re-check of the fixes. That is about four Codex prompts in total.

## Amendments from Codex plan review (7.0/10; these override the sections above)

1. **Fit trip.**
   - Add a repeatable camera request (a nonce or counter) that fits the active day in route mode, the hub in Stay mode, and the whole trip when no day has located stops. Hide the button when nothing is located.
   - `show_on_map({target:'trip'})` keeps its no-camera contract.
   - Test two taps after a manual pan.
2. **Agent button.**
   - Dock state stays owned by the persistent shell `WebMcpDock`.
   - A small shared "agent trigger slot" signal lets the trip branch render the trigger in the right stack. Non-trip, loading, failed and generating routes keep the current folded chip position.
   - The trigger stays visible over an expanded sheet, because the top stack sits above the sheet.
   - The hidden live region stays.
   - Verify supported/unsupported, navigation, rotation, approval, and close/focus behaviour.
3. **Hero pill.**
   - The Challenge lead stays a sibling, outside the anchor.
   - The demo anchor keeps "no account needed" in its accessible name and no WebMCP/agent/tool words in its text.
   - The path literal stays in `ChallengeBanner.tsx`, and the full notice and fine print stay in the DOM.
   - Desktop keeps publishing the banner height.
   - Do not weaken any landing contract test. Structural test edits are listed explicitly in the report.
4. **Dates and distance.**
   - Date strip: date-only formatting from `day_date` with a "Day N" fallback when it is null.
   - Distance stat is labelled "Routed distance" and sums only routed legs with a known distance. Show "—" when no leg has one; never show "0 km".
   - Add null-date, partial-distance and no-leg fixtures.
5. **Geometry measured before A2.**
   - A1 ends with a measured prototype at 390×844 and 360×640, with hotels and supported WebMCP.
   - In compact state, one full stop card with its evidence sub-card must fit. If it doesn't, the day sub-header scrolls with the list and the date strip shrinks.
   - Update `frame-padding.ts` for the right-hand button stack (right padding) and the header height, and test that controls never cover the framed pins.
6. **Phone markers and CSS scoping.**
   - Marker graphics rebuild on live 767↔768 layout changes, with no re-frame and no duplicate handlers. A null or SSR layout draws the desktop markers.
   - Map and dock surfaces get explicit phone classes under a `max-width: 767.98px` media query in `mobile-ui.css`.
   - No shared palette tokens or generic desktop selectors change.
   - Verify marker DOM after a round trip across the breakpoint.
7. **Shared files.**
   - The orchestrator owns `mobile-ui.css`, `app/layout.tsx` and `globals.css`.
   - Both tabs start from the pinned token commit. Any later shared commit is announced to both tabs, and Tab B rebases its own branch onto it.
   - Landing tests owned by Tab B: `app/__tests__/landing-phone.test.tsx` and `app/__tests__/landing-hackathon.test.tsx`.
   - **Integration gate:** after the cherry-pick of Tab B's explicit commit range and the screenshot regeneration, rerun tsc, vitest, both-route phone flows and desktop diffs on the combined branch. Codex reviews the combined diff.
8. **Header and accessibility.**
   - The header floats after `scrollY > 8`.
   - Verify: first paint (SSR), scroll down and up, anchor arrival below the header, rotation with stable nav geometry, focus-visible rings on every kit element, disclosure `aria-expanded`, selected-day `aria-current` / accessible name "Day 1, Thu 18 Sep", WCAG AA text contrast, and reduced motion.
   - Edge fixtures: long title, null date, empty day, hotel without coordinates, feedback, approval.
9. **Screenshot pipeline.**
   - Store as AVIF/WebP (with a PNG fallback only if needed), ≤ 150 KB each, with explicit width and height.
   - The hero image uses `priority` only on phones. Desktop must not download phone-only promotional images: they sit inside a phone-only `<picture>`/`media` or a CSS-hidden wrapper that does not fetch.
   - Capture the public demo after the map settles, with the Mapbox/OSM attribution visible in the frame or as a caption under it.
   - All frame art is drawn in CSS by us; no Placify files are committed.
10. **Overnight termination.** There are three outcomes:
    - **DONE:** all criteria met.
    - **PARTIAL:** a phase is parked after three failures. Dependent steps stop: no integration or capture that depends on it. Verified phases are pushed on their own branch, and unverified integration is never pushed.
    - **BLOCKED:** a required permission is pending. It waits for Shaun and is never routed around.

    The morning report lists every criterion as met or unmet, with commits and evidence.

## Acceptance criteria

1. **Phones, both routes, at 360×640, 390×844 and 430×932:**
   - no document overflow
   - every interactive element uses the kit or is a map pin, hit-tests as itself, and is ≥ 44×44
   - no text < 12 px inside the changed surfaces
2. **Trip page at 390×844 first load:**
   - the map with its circular controls is visible
   - the sheet shows the header, day strip and at least one full stop card with its evidence sub-card
   - no agent UI when WebMCP is unsupported
3. **Trip interactions:** every behaviour from the previous plan still passes its existing tests:
   - selection framing, re-fit
   - sheet geometry
   - tool registration stability, `show_on_map` / `get_place_evidence` output
   - the feedback-draft rotation and popup reconciliation fixes
4. **Home page at 390×844:**
   - the hero pill, headline and both CTAs are in the first viewport
   - the header becomes a floating card after scrolling
   - the anchor link lands below the header
   - the demo link works
5. **Desktop.** 1024 and 1440 on `/` and `/app/trip/demo` match the pre-revamp captures (≤ 0.1% outside animated video and map-label regions).
6. **Checks.** `npx tsc --noEmit` is clean. `NODE_OPTIONS=--no-experimental-webstorage npx vitest run` is all green, with new logic covered by tests.
7. **Reviews.** The visual reviewer finds no High issues against the spec. Codex's final review is ≥ 7 overall with no dimension ≤ 3, and its High findings are fixed.

## Out of scope and constraints

- Out of scope: backend, schema, API, `backend-types.ts`, Vercel and `NEXT_PUBLIC_*`.
- No live generation: the local backend is idle, and nobody clicks generate.
- Placify features Astrail lacks are out: drag reorder, share, Today/NOW, recap journal, search. No dead buttons for them.
- Evidence contract: quotes stay verbatim, and unsourced stops say so.
- A real iPhone Safari check remains Shaun's.

## Overnight operation

- **Watchers:** background watchers on both Herdr panes wake the orchestrator when either tab finishes or stops on an approval prompt.
- **Approval prompts:** the orchestrator never approves on Shaun's behalf. If a tab is blocked on a permission it can't avoid, the orchestrator reroutes the step (e.g. runs the command itself when already authorized) or leaves it for the morning report.
- **Stop condition:** all acceptance criteria met, both branches pushed, a morning report with before/after screenshots.
- **Failures:** a tab that fails the same phase review twice gets a narrowed prompt. After three failures that phase is parked and reported.
