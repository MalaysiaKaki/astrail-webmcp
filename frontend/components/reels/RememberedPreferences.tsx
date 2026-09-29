'use client'

import { useEffect, useState } from 'react'
import { getMemoryPreferences } from '@/lib/trip/supabase-api'
import { summarizeMemoryFacts } from '@/lib/trip/memory-summary'
import { ACCENT_TAG, EYEBROW } from '@/lib/shell/ui'

/**
 * What Astrail already knows about how you travel, said on the screen you start from.
 *
 * The agent plans using preferences the user never restated in this session — that is the point of
 * remembering them — and until now the only place to see what those were was Settings. So the
 * person watching Astrail work, and anyone watching over their shoulder, had no way to know what
 * context it was acting on before it acted. This is the disclosure.
 *
 * The SILENCE is the load-bearing half. Nothing renders unless memory is readable AND holds
 * something: a fresh account has nothing to disclose, so a panel there would be noise on the one
 * screen that has to stay clean, and "memory unavailable" is a status a user cannot act on
 * anyway. The disabled and unavailable states belong to Settings, which states them properly and
 * offers the controls that go with them (`components/settings/SettingsView.tsx`).
 *
 * The text is mem0 prose, which is the user's own wording round-tripped through a model and can
 * reach the store through the agent's `preferences` argument. It is rendered as text, never as
 * markup, and `summarizeMemoryFacts` collapses its whitespace before it gets here (guardrail #11).
 */

/**
 * One read per half-minute, not one per mount.
 *
 * `GET /settings/preferences` is rate-limited at BURST_LIMIT — three a minute
 * (`backend/rate_limit.py`) — and this component sits in `SavedReelsFlow`'s default branch, which
 * unmounts and remounts on every phase change. Home → trays → home is three reads before the user
 * has done anything, and `plan_trip_from_reels` spends one of the same allowance on its own memory
 * check. The fourth request 429s, which the tool correctly treats as unknown and plans anyway —
 * but the approval card then silently loses the disclosure it was supposed to make.
 *
 * A TTL rather than a permanent cache because the value CHANGES: the first trip a user states
 * preferences on writes a memory, and this line has to show it on the way back. Thirty seconds is
 * comfortably longer than a phase flip and shorter than a generation.
 */
const CACHE_TTL_MS = 30_000
let cache: { at: number; summary: string | null } | null = null

/** Test-only: module state outlives `cleanup()`, so a suite would inherit the previous case's read. */
export function __resetRememberedPreferencesCache() {
  cache = null
}

export default function RememberedPreferences() {
  const [remembered, setRemembered] = useState<string | null>(
    cache && Date.now() - cache.at < CACHE_TTL_MS ? cache.summary : null,
  )

  useEffect(() => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return
    let active = true
    getMemoryPreferences()
      .then((res) => {
        // `status` and `facts` answer different questions and the backend keeps them apart for
        // exactly this reason: an empty list under a non-ok status is a failed read, not an
        // honest empty. Array.isArray, not truthiness — a malformed payload is unknown.
        // A failed read is NOT cached: it would hold the silence past the outage that caused it.
        if (res.status !== 'ok' || !Array.isArray(res.facts)) return
        const summary = summarizeMemoryFacts(res.facts)
        cache = { at: Date.now(), summary }
        if (active) setRemembered(summary)
      })
      .catch(() => {
        /* `getMemoryPreferences` maps its own failures to `unavailable`, but it builds the
           Supabase client before its try block, so this can still reject. Saying nothing is the
           whole behaviour on every other unreadable state; a throw would be the home page
           falling over because it could not read a line it was only going to decorate with. */
      })
    return () => { active = false }
  }, [])

  if (!remembered) return null

  return (
    <section
      aria-label="What Astrail remembers about you"
      data-memory-panel
      className="m-card mx-auto mb-6 w-full max-w-5xl p-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* The same breathing dot the activity rail uses for a live agent action: memory is
            acting on the user's behalf before they have asked for anything. Reduced-motion
            switches the animation off in globals.css; the dot itself stays. */}
        <span aria-hidden className="pulse-dot pulse-dot--live" />
        <span className={ACCENT_TAG}>Memory</span>
        <span className={EYEBROW}>Astrail remembers how you travel</span>
      </div>
      {/* Clipped, not scrolled: an account with a lot remembered must not be able to push the
          library off the screen this sits above. */}
      <p className="t-body line-clamp-3 text-[color:var(--m-text)]">{remembered}</p>
    </section>
  )
}
