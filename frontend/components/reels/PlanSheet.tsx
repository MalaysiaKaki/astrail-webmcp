'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getProfile } from '@/lib/trip/supabase-api'
import { budgetLabel } from '@/lib/trip/trip-presenters'
import type { BriefInput } from '@/lib/trip/parse-inspiration'
import type { SavedReelPlaceProof } from '@/lib/reels/backend-types'
import type { BudgetLevel } from '@/lib/trip/backend-types'
import { ACCENT_TAG, BODY, EYEBROW, INPUT, META, MAP_SHEET, ROW_GROUP, SHEET_HANDLE, TEXT_BUTTON } from '@/lib/shell/ui'
import VerifiedPlacesMap from './VerifiedPlacesMap'
import DateRangePicker from '@/components/create/DateRangePicker'

/* The slim plan sheet (02-tray state B): Astrail already knows almost everything, so it
   shows the inferred values with their provenance and asks only for dates. Replaces the
   old 6-field brief form + review. Map-first, over the selected places. Inferred values
   come from the places (Where) and the saved profile (From / Style); Budget defaults. */

function deriveDestination(places: SavedReelPlaceProof[]): string {
  const countries = Array.from(new Set(places.map((p) => p.country_name).filter(Boolean)))
  if (countries.length === 0) return ''
  if (countries.length === 1) return countries[0]
  if (countries.length === 2) return `${countries[0]} & ${countries[1]}`
  return `${countries.length} countries`
}

const BUDGETS: BudgetLevel[] = ['budget', 'mid_range', 'premium', 'luxury']
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className={`${EYEBROW} pt-1`}>{label}</span>
      <span className="flex min-w-0 flex-col items-end text-right">{children}</span>
    </div>
  )
}
function Provenance({ children }: { children: React.ReactNode }) {
  return <span className={`${ACCENT_TAG} mt-1`}>{children}</span>
}

export default function PlanSheet({
  places,
  reelCount,
  brief,
  onBrief,
  onBack,
  onGenerate,
  error,
  gateSlot,
}: {
  places: SavedReelPlaceProof[]
  reelCount: number
  brief: BriefInput
  onBrief: (updater: (b: BriefInput) => BriefInput) => void
  onBack: () => void
  onGenerate: () => void
  error?: string | null
  // Optional node rendered in place of the Generate button. PlanSheet stays presentational:
  // it renders whatever it is handed and knows nothing about entitlements — the gate decision
  // lives in SavedReelsFlow (via useEntitlement).
  gateSlot?: React.ReactNode
}) {
  const [originFromProfile, setOriginFromProfile] = useState<string | null>(null)
  const [styleFromProfile, setStyleFromProfile] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const populated = useRef(false)
  const destination = useMemo(() => deriveDestination(places), [places])

  // Pre-fill the brief once from the selected places + saved profile (never clobber edits).
  useEffect(() => {
    if (populated.current) return
    populated.current = true
    if (destination) onBrief((b) => (b.destination_hint ? b : { ...b, destination_hint: destination }))
    let active = true
    getProfile()
      .then(({ profile }) => {
        if (!active) return
        const origin = profile.origin_city ?? null
        const style = [...(profile.travel_style_tags ?? []), profile.preference_notes ?? ''].filter(Boolean).join(', ') || null
        setOriginFromProfile(origin)
        setStyleFromProfile(style)
        onBrief((b) => ({
          ...b,
          origin_city: b.origin_city || (origin ?? ''),
          preferences: b.preferences || (style ?? ''),
        }))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [destination, onBrief])

  const ready = Boolean(brief.start_date && brief.end_date)
  const whereText = brief.destination_hint || destination
  const originText = brief.origin_city || originFromProfile || ''
  const styleText = brief.preferences || styleFromProfile || ''

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[color:var(--night-900)]">
      <VerifiedPlacesMap places={places} className="absolute inset-0 h-full w-full" />

      <div className="absolute left-0 top-0 z-10 p-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to places"
          className="m-btn-icon text-[18px]"
        >
          ←
        </button>
      </div>

      <section className={`${MAP_SHEET} max-h-[82dvh] md:max-h-none`}>
        <div aria-hidden className={SHEET_HANDLE} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
          <div className="mb-4 flex items-baseline justify-between px-1">
            <h2 className="t-title font-medium text-[color:var(--m-text)]">Plan this trip</h2>
            <span className={META}>{places.length} places</span>
          </div>

          <div className={ROW_GROUP}>
            <Row label="Where">
              {editing ? (
                <input
                  aria-label="Destination"
                  value={brief.destination_hint}
                  onChange={(e) => onBrief((b) => ({ ...b, destination_hint: e.target.value }))}
                  placeholder={destination || 'Where to?'}
                  className={`w-44 text-right ${INPUT}`}
                />
              ) : (
                <>
                  <span className={`${BODY} font-semibold`}>{whereText || 'Astrail will infer'}</span>
                  <Provenance>From {reelCount} of your Reels</Provenance>
                </>
              )}
            </Row>

            <Row label="From">
              {editing ? (
                <input
                  aria-label="Origin city"
                  value={brief.origin_city}
                  onChange={(e) => onBrief((b) => ({ ...b, origin_city: e.target.value }))}
                  placeholder="Home city"
                  className={`w-44 text-right ${INPUT}`}
                />
              ) : (
                <>
                  <span className={`${BODY} font-semibold`}>{originText || 'Not set'}</span>
                  <Provenance>{originText ? 'Your profile' : 'Optional'}</Provenance>
                </>
              )}
            </Row>

            <Row label="Budget">
              {editing ? (
                <select
                  aria-label="Budget"
                  value={brief.budget_level}
                  onChange={(e) => onBrief((b) => ({ ...b, budget_level: e.target.value as BudgetLevel | '' }))}
                  className={`w-44 text-right ${INPUT}`}
                >
                  <option value="">No preference</option>
                  {BUDGETS.map((b) => (
                    <option key={b} value={b}>{budgetLabel(b)}</option>
                  ))}
                </select>
              ) : (
                <>
                  <span className={`${BODY} font-semibold`}>{brief.budget_level ? budgetLabel(brief.budget_level) : 'Mid-range'}</span>
                  <Provenance>{brief.budget_level ? 'Your choice' : 'Astrail’s default'}</Provenance>
                </>
              )}
            </Row>

            <Row label="Style">
              {editing ? (
                <input
                  aria-label="Style"
                  value={brief.preferences}
                  onChange={(e) => onBrief((b) => ({ ...b, preferences: e.target.value }))}
                  placeholder="Pace, food, what you avoid…"
                  className={`w-44 text-right ${INPUT}`}
                />
              ) : (
                <>
                  <span className={`${BODY} max-w-[220px] font-semibold`}>{styleText || 'Balanced first draft'}</span>
                  <Provenance>{styleText ? 'Your profile' : 'Inferred from your Reels'}</Provenance>
                </>
              )}
            </Row>
          </div>

          <div className="mt-6">
            <p className={`${EYEBROW} mb-2 px-1`}>When are you going?</p>
            <DateRangePicker
              variant="paper"
              placement="top"
              showLabel={false}
              startDate={brief.start_date}
              endDate={brief.end_date}
              onChange={(start, end) => onBrief((b) => ({ ...b, start_date: start, end_date: end }))}
            />
            {/* This line used to read "Skip this and Astrail builds a 3-day draft you can date
                later" while the Generate button below was hard-disabled without dates — telling
                someone an action is optional and then refusing it is the clearest way to leave
                them stuck at "I don't know how to start". Now the offer is real: the button fills
                the picker with a visible range they can see and change before generating. */}
            {ready ? null : (
              <p className={`${META} mt-2 flex flex-wrap items-center gap-x-1 px-1`}>
                Not sure yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date()
                    start.setDate(start.getDate() + 1)
                    const end = new Date(start)
                    end.setDate(end.getDate() + 2)
                    const iso = (d: Date) => d.toISOString().slice(0, 10)
                    onBrief((b) => ({ ...b, start_date: iso(start), end_date: iso(end) }))
                  }}
                  className={`${TEXT_BUTTON} underline underline-offset-2`}
                >
                  Use a 3-day draft
                </button>{' '}
                and change the dates later.
              </p>
            )}
          </div>

          <button type="button" onClick={() => setEditing((e) => !e)} className={`${TEXT_BUTTON} mt-3`}>
            {editing ? 'Done editing' : 'Change any of the above'}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-[color:var(--m-page)] via-[color:var(--m-page)] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          {error ? (
            <p role="alert" className="m-subcard pointer-events-auto max-h-24 overflow-y-auto px-4 py-2 text-[length:var(--t-meta)] font-semibold text-[color:var(--fail)]">
              {error}
            </p>
          ) : null}
          {gateSlot ? (
            <div className="pointer-events-auto">{gateSlot}</div>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={!ready}
              className="m-btn-primary pointer-events-auto w-full disabled:cursor-default disabled:opacity-50"
            >
              {ready ? 'Generate trip' : 'Add your dates to generate'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
