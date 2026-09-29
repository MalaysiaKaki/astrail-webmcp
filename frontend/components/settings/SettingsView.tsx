'use client'

import { useEffect, useRef, useState } from 'react'
// Profile (origin/style/interests) comes from the RLS-guarded traveler_profiles row and the
// remembered facts come from the backend's mem0 store — the same live reads the plan sheet uses,
// never the mock. Clearing memory now hits the REAL POST /settings/memory/clear (no longer the
// mock's fake success): the backend is STRICT and surfaces distinct honest states.
import { getProfile, getMemoryPreferences } from '@/lib/trip/supabase-api'
import { ApiError, clearMemory } from '@/lib/trip/api'
import { getAccessToken } from '@/lib/supabase/session'
import {
  ERROR_CODE_MEMORY_CLEAR_UNKNOWN,
  type MemoryFact,
  type MemoryStatus,
  type TravelerProfile,
} from '@/lib/trip/backend-types'
import DeleteAccountCard from '@/components/settings/DeleteAccountCard'
import AccountRows from '@/components/settings/AccountRows'
import { ACCENT_TAG, BODY, CARD, DESTRUCTIVE_BUTTON, META, PAGE_TITLE, ROW_GROUP, SECTION_TITLE } from '@/lib/shell/ui'

// Self-serve account deletion is HIDDEN until go-live: Task 6 flips this frontend flag together
// with the backend `_DELETION_EXECUTION_READY` gate. Read at render (not a module const) so it
// stays default-off in the current build while remaining togglable. Gating the child's mount here
// keeps the delete control — and its auth/session work — entirely out of the current build.
function deletionUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DELETION_ENABLED === 'true'
}

type ProfileData = { profile: TravelerProfile; status: MemoryStatus; facts: MemoryFact[] }

// Honest end-states of the real clear-memory call (never a fake success): 'cleared' = the backend
// verified the wipe; 'unavailable' = 503 / memory_unavailable / a transport error (nothing was
// deleted — the message the button shows while the backend gate is still off); 'unknown' = the
// backend attempted it but couldn't confirm (memory_clear_unknown).
type ClearStatus = 'idle' | 'clearing' | 'cleared' | 'unavailable' | 'unknown'

// One read-only row of the preferences group: a muted label over the value, hairline-separated by
// the group (ROW_GROUP). Not interactive, so no chevron.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3.5">
      <dt className={META}>{label}</dt>
      <dd className={BODY}>{value}</dd>
    </div>
  )
}

// Static provenance tag for a remembered mem0 memory. Matches EvidenceChip's "Memory"
// label (KIND_LABEL.memory_preference) but drops the confidence % — mem0 carries no score.
function MemoryTag() {
  return <span className={ACCENT_TAG}>Memory</span>
}

// Placify grouped settings (web revamp C4): each section is a serif title (plus a line of
// context where it helps) over one white card. Recipes: lib/shell/ui.ts.
const SECTION = 'flex flex-col gap-3'
const STATUS_TEXT = META

export default function SettingsView() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [clearStatus, setClearStatus] = useState<ClearStatus>('idle')
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    // Profile and remembered facts are two different live sources (Supabase row vs mem0
    // backend); fetch both, then render together once the shell has real data.
    Promise.all([getProfile(), getMemoryPreferences()])
      .then(([p, mem]) => {
        if (activeRef.current) setData({ profile: p.profile, status: mem.status, facts: mem.facts })
      })
      .catch((e: unknown) => {
        /* A rejected profile read (an expired session, RLS, the network) says so instead of
           loading forever. mem0 failures degrade to a status inside the read and never land here. */
        console.error('[settings] profile/preferences read failed', e)
        if (activeRef.current) setLoadFailed(true)
      })
    return () => {
      activeRef.current = false
    }
  }, [])

  async function handleClear() {
    setClearStatus('clearing')
    try {
      const token = await getAccessToken()
      await clearMemory(token)
      if (!activeRef.current) return
      setClearStatus('cleared')
    } catch (e) {
      if (!activeRef.current) return
      // Honest states — NEVER a fake success. memory_clear_unknown = the backend attempted the
      // wipe but couldn't confirm it; anything else (memory_unavailable / 503 / a network error)
      // means we couldn't reach the service and nothing was deleted.
      setClearStatus(
        e instanceof ApiError && e.code === ERROR_CODE_MEMORY_CLEAR_UNKNOWN ? 'unknown' : 'unavailable',
      )
    }
  }

  // The page frame (title + account rows) never waits on the reads: Feedback and Log out must work
  // while profile/preferences are pending or have failed.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className={PAGE_TITLE}>Settings</h1>

      {data ? (
        <LoadedSettings data={data} clearStatus={clearStatus} onClear={handleClear} />
      ) : loadFailed ? (
        <p role="alert" className={`${CARD} ${BODY}`}>
          Couldn’t load your settings. Refresh the page to try again.
        </p>
      ) : (
        <p className={META}>Loading your settings…</p>
      )}

      <AccountRows />

      {/* Self-serve deletion — hidden until go-live (Task 6 flips NEXT_PUBLIC_DELETION_ENABLED).
          Gated at the mount site so the control never renders in the current build. Still only
          once the account's settings have loaded, as before. */}
      {data && deletionUiEnabled() ? <DeleteAccountCard /> : null}
    </div>
  )
}

function LoadedSettings({
  data,
  clearStatus,
  onClear,
}: {
  data: ProfileData
  clearStatus: ClearStatus
  onClear: () => void
}) {
  const { profile, status, facts } = data

  return (
    <>
      <section aria-labelledby="settings-preferences" className={SECTION}>
        <h2 id="settings-preferences" className={SECTION_TITLE}>Using your saved travel preferences</h2>
        <dl className={ROW_GROUP}>
          <Row label="Origin" value={profile.origin_city ?? 'Not set'} />
          <Row label="Travel style" value={profile.travel_style_tags.join(', ') || 'None yet'} />
          <Row label="Interests" value={profile.preference_tags.join(', ') || 'None yet'} />
          <Row label="Notes" value={profile.preference_notes ?? 'None'} />
        </dl>
      </section>

      <section aria-labelledby="settings-memory" className={SECTION}>
        <div>
          <h2 id="settings-memory" className={SECTION_TITLE}>What Astrail remembers</h2>
          <p className={`mt-1 ${META}`}>
            Every remembered fact shows where it came from. Clearing it takes effect on your next trip.
          </p>
        </div>

        <div className={`${CARD} flex flex-col gap-4`}>
          {clearStatus === 'cleared' ? (
            <p className={STATUS_TEXT}>Memory cleared. Astrail will infer fresh preferences next time.</p>
          ) : status !== 'ok' ? (
            /* Distinguish "memory is down" from "nothing saved yet" (backend api/schemas.py):
               an empty list under a non-ok status is a failure, not an honest empty state. */
            <p className={STATUS_TEXT}>
              {status === 'disabled'
                ? 'Preference memory is turned off for your account.'
                : 'Couldn’t load your saved preferences right now. Try again in a moment.'}
            </p>
          ) : facts.length === 0 ? (
            <p className={STATUS_TEXT}>Astrail hasn’t remembered anything yet. Plan a trip and your preferences start building here.</p>
          ) : (
            /* Every remembered item is a mem0 memory, so each carries the same "Memory"
               provenance (DESIGN.md §7 disclosure). No confidence % — mem0 returns prose with
               no score, and showing an invented number would fabricate data (guardrail #1). */
            <ul className="flex flex-col divide-y divide-[color:var(--line-soft)]">
              {facts.map((fact) => (
                <li key={fact.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 ${BODY}`}>
                  <span className="min-w-0">{fact.memory}</span>
                  <MemoryTag />
                </li>
              ))}
            </ul>
          )}

          {/* Clear-all memory is a destructive action the user takes and can't undo —
              the one place --fail belongs on a control (DESIGN.md §9 / palette). */}
          <button
            type="button"
            onClick={onClear}
            disabled={clearStatus === 'cleared' || clearStatus === 'clearing'}
            className={`${DESTRUCTIVE_BUTTON} self-start`}
          >
            {clearStatus === 'clearing' ? 'Clearing…' : 'Clear memory'}
          </button>

          {/* Honest outcome of a REAL clear — never a fake success. Truthful copy for each backend
              state; while the reconciliation gate is off the backend 503s → "couldn't reach". */}
          {clearStatus === 'unavailable' ? (
            <p role="status" className={STATUS_TEXT}>
              Couldn’t reach the memory service — try again later.
            </p>
          ) : clearStatus === 'unknown' ? (
            <p role="status" className={STATUS_TEXT}>
              Clearing started — couldn’t fully confirm.
            </p>
          ) : null}
        </div>
      </section>
    </>
  )
}
