# Desktop trip page v2: clear navigation, memory first, visual build story

Status: draft · Planner: Claude Opus 5.5 · Verifier: Codex · Implementers: Herdr Claude tabs · Base: `feat/mobile-view` @ `0e4f41c` (pushed, integrated web revamp).

## Request (Shaun, 2026-09-29)

The desktop trip page still reads as mostly text and is hard to navigate. Shaun wants:

- The memory emphasised: what Astrail remembered and used for this trip, and what this trip adds to memory.
- "How Astrail built this" given the same weight.
- The trip presented visually.
- Placify-style map and pins.

Build on the phone Placify work. Focus on desktop (≥ 768); phone keeps its current view.

## Data truth (from code research; nothing is invented)

**Memory used.** `trip.preference_summary` is a string and `trip.preference_sources` is an array.

- When the source is memory, the summary is `"Using your saved travel preferences: " + facts.join("; ")` (`backend/pipeline/preferences.py:64-66`).
- A real trip uses either explicit preferences or memory, never both. (The demo fixture claims both.)
- Facts may be split on `"; "` **only** after that known prefix. Otherwise the summary is shown as one statement.

**Memory learned by this trip.** The `memory_events` table records it: `trip_id`, `event_type='learned'`, `learned_facts_json:[{fact}]`, readable by its owner through RLS.

- The migration is `supabase/migrations/20260701131304_identity_persona_foundation.sql:120-128, 174, 248-252`.
- The frontend never reads it today.
- A row is written only for explicit-preference trips (`preferences.py:274-285, 386-388`).
- Honest empty states:
  - "This trip used your saved memory, so it didn't add anything new"
  - "Nothing new remembered from this trip"

**How it was built.** All `generation_events` rows are persisted (`{event_type, stage, message, payload}`, 15 stages).

- Counts come from bundle array lengths: stops, days, legs routed OK, restaurants, hotels, and Reels from the `create_trip` payload's `reel_urls`.
- Counts are **not** parsed out of message text.
- `heartbeat`, `result` and `create_trip` rows are not shown as steps.
- The weather step shows its text only.

**Visual assets.**
- Reel covers come from `thumbnailFor` (one per Reel, and null for places with no Reel).
- `trip_days.weather_payload` holds temperature, precipitation and weather code. The fixture uses a different shape, so handle both and fall back to `weather_summary` text.
- Place types, quotes, rationale, legs with mode, distance and geometry.
- No hotel photos.

## Design (Placify patterns, Astrail tokens and kit)

**Floating panel information architecture.** The left panel keeps its size and collapse behaviour.

1. **Hero header.**
   - A cover collage of the trip's Reel thumbnails: up to 4 in a Placify-style stacked cluster, with a "+N" badge and brand-glyph tiles when there are no covers.
   - Serif title, dates and origin.
   - Stat chips: Places · Days · Routed km, per the existing honest rule.
   - A personalised badge, "Planned around your taste", shown only when memory or explicit preferences were used.
   - The Sample tag for the demo.
2. **Segmented tab nav.** A Placify pill segmented control: **Trip · For you · How it was built**.
   - `role="tablist"` with arrow-key navigation.
   - The selected tab persists per trip session.
   - Deep-linkable with `?tab=`, without breaking existing routes.
3. **Trip tab (itinerary).**
   - Date strip.
   - Per-day header card: serif date, a Day N capsule, the day title, and a weather chip with an icon from the weather code (else summary text).
   - The existing StopCard list with legs. The day summary moves behind "Day overview".
   - Lead with pictures, keep text short: quote clamps stay, and rationale shows only in the expanded card.
   - Stay stays as a chip when hotels exist.
4. **For you tab (memory emphasis).**
   - **"What Astrail remembered about how you travel"**: memory facts as chips with a "Memory" source tag, or explicit preferences as "You told us" chips, taken from the trip's stored summary as described above.
   - **"What this trip taught Astrail"**: the learned facts from `memory_events` for this trip, or the honest empty state.
   - **"Picked for you"**: Astrail-suggestion stops, each with its rationale, plus trade-off notes. Each links to the stop (selecting it on the map).
   - A card link, "Manage what Astrail remembers →", to `/app/settings`.
   - Demo: a clearly sample-labelled fixture for learned facts, living in the insights folder. It is never shown for real trips.
5. **How it was built tab.** A vertical Placify step timeline, one kit card per step. Each step has:
   - an icon
   - a title (Read your Reels / Found places / Checked for duplicates / Saved stops / Routed legs / Checked weather / Found places to eat / Wrote day summaries)
   - a count chip from the bundle
   - a warning or dropped state highlighted, with the stored message as secondary text

   "Show full log" is a disclosure of the raw filtered event list. The existing `AgentDecisionRail` content lives here.
6. **About** content is redistributed:
   - summary → hero or Trip tab
   - preferences → For you
   - trade-offs → For you
   - decisions → How it was built
   - feedback → a card at the end of the Trip tab
   - missing details → a hero badge that opens a list

   Nothing is lost; the capability matrix is updated.

**Map and pins (desktop, Placify).**
- **Active day:** photo-avatar pins, always with a numbered badge. Name pills are visible for the active day's pins at zoom ≥ 11. The selected pin is larger with an ink ring.
- **Other days:** pins dimmed (opacity about 0.45, no name pill) and still clickable.
- **Hover** (pointer devices) shows a light preview card: cover, name, "Stop N · Day D", and "Click to open". There is no popup on click; click selects the card as now. The undayed fallback is covered below.
- **Route line:** the active day's route is thicker (5–6px) in the brand route colour with a soft casing, with direction chevrons along it. Other days' routes are thin and dimmed.
- **Day chip** floating top-centre on the map: "Day 1 · Sep 18".
- Stays within the current style load budget; no new sources beyond route layers.

## Codex final-review fixes (included)

1. **Undayed places.** A selected place outside the active day's list (for example an undayed hotel base) gets a detail fallback: a pinned "Selected place" card at the top of the Trip tab using the existing StopDetail model, including Show in 3D.
2. **First desktop fit.** The first desktop panel-obstruction measurement triggers the intent-preserving one-time refit, as on phone, and does so on phone → desktop rotation too. The camera test covers the first measurement.
3. **Desktop dock.** One bounded scroll area with a fixed footer (Minimise and status always visible), as the phone dock has. Test child reachability at 844×390 with prompts, tools and activity open.
4. **Dock height.** `dockRoom` subscribes to viewport height; test a height-only resize.
5. **DateRangePicker** (Tab C). Clamp to the available viewport height with internal scroll or flip placement. Test reachability at 844×390 with a six-week month.

## Work split (disjoint files)

**Tab A** (`mobile-impl`, worktree `astrail-mobile`, branch `feat/mobile-view`, port 3000)
- Owns `components/trip/**` except `components/trip/insights/**`, plus `components/map/**`, `components/webmcp/**`, `lib/trip/**` except `lib/trip/insights/**`, and `lib/webmcp/**`.
- Scope: panel information architecture, hero, tabs, Trip tab, map and pins, fixes 1–4, and wiring Tab B's components in.

**Tab B** (`landing-impl`, worktree `astrail-mobile-landing`, new branch `feat/trip-insights` cut from `feat/mobile-view` @ HEAD, port 3002)
- Owns new files only: `components/trip/insights/**` and `lib/trip/insights/**`.
- Builds:
  - `ForYouTab` and `BuildTimeline` components with typed props (`TripBundle` in, callbacks out)
  - `lib/trip/insights/memory.ts` (summary parsing, source labels)
  - `lib/trip/insights/memory-events.ts`: a Supabase read of `memory_events` for `trip_id` under RLS, typed, with errors surfaced as an "unavailable" state
  - `lib/trip/insights/build-steps.ts` (bundle → steps)
  - the demo fixture for learned facts
- Tests for all of it. A storybook-like harness page is **not** allowed. Verify with unit tests plus a temporary uncommitted mount in its worktree.
- The API is frozen after B1 and handed to Tab A through a cherry-pick of the commit (tracked).

**Tab C** (`shell-impl`, `feat/app-shell`, port 3004): fix 5, then idle.

**Orchestrator:** reviews each phase (harness plus Arc at desktop 1024/1440), cherry-picks B → A, runs the integration gate, sends the plan and final diff to Codex, and pushes.

## Phases

- **A9:** Codex fixes 1–4. Then the panel information architecture: hero, tabs and the Trip tab (For you and How it was built as placeholders until Tab B's components land). Then map and pins.
- **B8:** insights libraries and components; API frozen.
- **A10:** wire in Tab B's components, redistribute About, capability matrix update, polish.
- **C6:** DatePicker fix.
- **Integration:** gate, then Codex final review, then fixes, then push.

## Amendments from Codex plan review v1 (6.8/10; these override the sections above)

1. **(High) Memory audit rows are write attempts, not confirmed memories.**
   - A `memory_events` 'learned' row is inserted *before* the Mem0 add. Its `learned_facts_json` holds the user's own explicit text, not Mem0's extracted facts.
   - Present it as **"Preferences you gave this trip, sent to your memory"**, showing the text verbatim and the date.
   - Sub-copy: "Saved when this trip was planned. See what Astrail remembers now →" (links to `/app/settings`).
   - Never claim it was learned or retained.
   - Distinguish these states: loading, unavailable (error), none recorded ("No memory write recorded for this trip"), and recorded.
   - Write-back happens after the terminal result, so an empty first read offers a "Check again" action and re-queries once when the tab is reopened. It is not cached permanently.
   - No memory query on the anonymous demo. The demo uses the sample-labelled fixture.
   - Tests: orphan intent, failed read, empty read then later filled, the demo never queries, and another owner's rows are never shown.
2. **Preference source.** A stored summary can carry both `memory` and `explicit`, and `memory` may mean profile tags or notes (`compose_preference_summary`).
   - Use the persisted `preferences` event's `payload.preference_source` to corroborate what the pipeline actually used.
   - Split into Mem0 fact chips **only** when the summary has the known prefix **and** the event says memory.
   - Every other case (mixed, profile, unknown, missing) is shown as one neutral "Preferences this trip was planned with" note, with a source tag only when the event corroborates it.
   - The hero badge reads "Planned around your taste" only when corroborated; otherwise "Planned with your preferences".
   - Tests cover known-prefix, mixed/profile, inferred and missing.
3. **Reel counts.**
   - "Reels behind this trip" uses the loader's reconstructed `bundle.inspiration`, deduplicated by canonical URL.
   - Submitted URLs from the `create_trip` payload are shown separately only when present. Zero submitted is valid for a Library trip.
   - Missing provenance is "not recorded", never a verified zero.
   - Tests: Library, demo, removed Saved Reel, absent event.
4. **Build steps are event-backed.**
   - Each step's state comes from its persisted events: done, reused (cache or Library), warning, failed, or not recorded.
   - Bundle-derived counts are labelled as **current trip contents** ("5 stops on this trip"), not historical generation results.
   - There is no minimum card count; the timeline covers the evidence that exists.
   - The full log keeps raw warnings, repeated attempts and unsupported stages.
   - Tests: cached, Library, sparse log, warning, edited bundle.
5. **Reveal contract**, frozen before Tab B integrates: `revealPlace(placeId)`.
   - It selects the owning day, switches to the Trip tab, reopens a collapsed panel, exits Stay mode where needed, then scrolls to the card (or the undayed "Selected place" fallback) after mount.
   - It is used by map clicks, `show_on_map`, and For you "Picked for you" links. List taps keep their current behaviour.
   - `get_place_evidence` stays a pure read.
   - `TripTools` and the map stay outside the tab-dependent mounts, and tab changes never remount the map or interrupt the camera or 3D.
   - Tests: map click and `show_on_map` from the other two tabs, collapsed panel, Stay mode, cross-day, undayed, repeated selection, phone ↔ desktop.
6. **Map reconciliation.** An explicit update step covers day, zoom, selection, layout and refreshed bundle changes.
   - Active-day emphasis comes from paint/filter expressions on the existing route source by `day_number`. No new source; direction chevrons are a tracked symbol layer on the same source, removed by the route cleanup (route → hub → route, and shared-map exit).
   - Pin dimming and name pills update through the reconcile step without rebuilding markers or moving the camera.
   - The hover preview is cleaned up on marker replacement, selection, layout change and unmount. It never coexists with an open eat or hotel popup.
   - Road geometry, cross-day continuity and the unrouted fallback are preserved.
   - Kept tests: no source recreation on day switch (`TripMap.test.tsx:743`), phone selected-only label (`:1024`).
   - New tests: day switch without selection, zoom 10.9 ↔ 11, rotation across the breakpoint, refreshed itinerary, route → hub → route.
   - Phone behaviour is unchanged (desktop-gated).
7. **Label collisions.**
   - Active-day name pills are desktop-only at zoom ≥ 11.
   - A pill that would cross the right edge or a control rect flips to the pin's left.
   - When two unselected pills overlap, the later stop's pill is suppressed; the selected pill always wins.
   - Hover still shows the full name.
   - Runtime check at 1024 with a long-name stop at the right edge and two nearby stops, at zoom 11 and 14, panel open and collapsed, 3D off and on: every visible pill is fully on screen, legible and non-overlapping.
8. **Tab C transfer and branch hygiene.**
   - Tab C's scoped C6 commit (DatePicker plus its test) is cherry-picked onto `feat/mobile-view` before the integration gate.
   - Tab B's branch is cut from the committed `0e4f41c`, not the dirty QA worktree; Tab C must revert its stubs there first.
   - The API freeze happens at the end of **B8**, and it covers props, the sample/read-only flags, the memory read states and the `revealPlace` callback type.
   - Temporary mounts are never committed.
10. **Round 2 follow-ups.**
    - `show_on_map` day, trip and hotel targets also switch to the Trip tab and reopen the panel: the day list, the whole-trip view, or the Stay view.
    - A left-flipped pill must also clear the viewport's left edge and the expanded panel's right edge. When neither side fits, the pill is suppressed (hover still shows the name).
    - Label placement reconciles on camera `moveend`, including pan, pitch, bearing and the 3D toggle, not only on zoom. Throttle it to animation frames and remove the listeners on cleanup.
9. **Gate additions.**
   - Real-data branch cases above.
   - Hotel-bearing fixture.
   - Missing-detail causes beyond coordinates.
   - `?tab=` deep link versus history precedence (the URL wins on load; tab changes use `replaceState`).
   - Feedback and mutation refresh after the About redistribution.
   - `next build` passes for the `?tab=` implementation (`useSearchParams` inside a Suspense boundary).
   - The capability matrix names every retained behaviour.
   - Weather tests: mm versus percent, code 0, missing code, null summary, empty payload; never infer an icon from temperature or rain.

## Acceptance

1. Desktop at 1024 and 1440 on `/app/trip/demo`: hero with cover cluster and stats, a three-tab nav, and a Trip tab with per-day cards and weather chips.
   - The For you tab shows remembered facts or preferences and the learned facts (demo sample) or an honest empty state, with a Picked-for-you list.
   - The How it was built tab shows at least 6 step cards with counts derived from the bundle.
   - All text ≥ 12px, controls ≥ 44px, keyboard tabs work, WCAG AA contrast.
2. **Map.**
   - Active-day pins show name pills at zoom ≥ 11. Other days are dimmed.
   - Hover preview on pointer devices.
   - Thicker active route with casing and direction markers.
   - A day chip on the map.
   - Framing band checks pass, with 3D on and off.
3. **Honesty.**
   - No fabricated memory: learned facts come only from `memory_events`, or the sample-labelled demo fixture.
   - Facts are split only after the known prefix.
   - Counts come from the bundle.
   - Tests pin each rule.
4. **Codex fixes** 1–5 each have a failing-first test and pass.
5. **No regressions.**
   - Phone view unchanged (pixel diff at 360/390/430, apart from shared-component improvements, which are listed).
   - WebMCP registrations stable (6 on the demo). `tsc` clean. Vitest green. Phone and desktop flows pass.
6. Codex final review ≥ 7 with no dimension ≤ 3; High findings fixed.

## Out of scope

- No backend, schema, API, `backend-types.ts`, Vercel or `NEXT_PUBLIC_*` changes. `memory_events` is read directly under existing RLS, with a local TypeScript type in the insights folder.
- No new WebMCP tools. No live generation.
- Hotel photos are not available and are not added.
