'use client'

import { useMemo, useState } from 'react'
import { countryDisplayLabel, type CountryTray } from '@/lib/reels/organize'
import { sourceLabel } from '@/lib/reels/labels'
import { safeHref } from '@/lib/safe-href'
import { EYEBROW, GROUP_ROW, MAP_SHEET, META, ROW_GROUP, TAG } from '@/lib/shell/ui'
import VerifiedPlacesMap from './VerifiedPlacesMap'

/* Map-first tray: the collection over a full-bleed map (DESIGN.md — the map is the
   canvas). A retractable paper sheet (bottom on mobile / left rail on desktop, tap the
   grip to collapse) holds the grounded places grouped by country, each selectable; a FAB
   ("grounded" is the internal term for verified-against-the-map — the chip says "Places we
   found", because the word appears nowhere else a user can see and the chip has no room to
   define it)
   plans a trip from the selection. Full-bleed (fixed) so it escapes the /app sidebar shell.

   NOTE: grouped by country (SavedReelPlaceProof has country_code/name, not place_type —
   the mockup's Places/Food category chips need a backend place_type; deferred). */

export default function CountryTrays({
  trays,
  selectedPlaceIds,
  maxSelected,
  onToggle,
  onPlan,
  onBack,
}: {
  trays: CountryTray[]
  selectedPlaceIds: string[]
  maxSelected?: number
  onToggle: (placeId: string) => void
  onPlan: () => void
  // Additive escape hatch (T3.1b): create-trail enters this picker with no way back otherwise.
  // Optional so the organize path stays source-agnostic; the Back control renders only when given.
  onBack?: () => void
}) {
  const verifiedPlaces = useMemo(() => trays.flatMap((tray) => tray.places), [trays])
  const [collapsed, setCollapsed] = useState(false)
  const total = verifiedPlaces.length
  const countries = trays.length
  const cap = maxSelected ?? Infinity
  const atMax = selectedPlaceIds.length >= cap

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[color:var(--night-900)]">
      {/* Full-bleed map canvas */}
      <VerifiedPlacesMap places={verifiedPlaces} className="absolute inset-0 h-full w-full" />

      {/* Floating collection title over the map */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 p-4 md:pl-[460px]">
        {onBack ? (
          <button type="button" onClick={onBack} className="m-btn-secondary pointer-events-auto">
            <span aria-hidden>←</span> Back
          </button>
        ) : null}
        <span className="m-pill-badge t-body font-semibold">Places we found</span>
        <span className="m-pill-badge text-[length:var(--t-meta)]">
          {total} {total === 1 ? 'place' : 'places'} · {countries} {countries === 1 ? 'country' : 'countries'}
        </span>
      </div>

      {/* Retractable sheet — bottom on mobile, left rail on desktop. Tap the grip to collapse. */}
      <section
        className={`${MAP_SHEET} max-h-[70dvh] transition-transform duration-300 ease-out motion-reduce:transition-none md:max-h-none ${
          collapsed ? 'translate-y-[calc(100%-3.25rem)] md:translate-y-0 md:-translate-x-[calc(100%+1rem)]' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex min-h-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)]"
        >
          <span aria-hidden className="h-1.5 w-10 flex-none rounded-full bg-[rgba(28,23,16,0.18)]" />
          <span className="sr-only">{collapsed ? 'Show places' : 'Hide places'}</span>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32">
          {trays.map((tray) => (
            <div key={tray.country_code} className="mb-6">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className={EYEBROW}>{countryDisplayLabel(tray)}</h2>
                <span className={META}>{tray.places.length}</span>
              </div>
              <ul className={ROW_GROUP}>
                {tray.places.map((place) => {
                  const on = selectedPlaceIds.includes(place.place_id)
                  return (
                    <li key={place.place_id}>
                      <label
                        className={`${GROUP_ROW} cursor-pointer items-start py-3 has-[:focus-visible]:shadow-[inset_0_0_0_2px_var(--m-accent)] ${
                          on ? 'bg-[color:var(--m-subcard)]' : ''
                        }`}
                      >
                        {/* The native checkbox keeps its semantics; only its look is drawn here. The
                            /app shell's dark colour-scheme renders an unchecked native box as a dark
                            square, so it is appearance-none with a kit circle that fills with ink. */}
                        <span className="relative mt-0.5 grid h-6 w-6 flex-none place-items-center">
                          <input
                            type="checkbox"
                            aria-label={`Select ${place.name}`}
                            checked={on}
                            disabled={!on && atMax}
                            onChange={() => onToggle(place.place_id)}
                            className="peer absolute inset-0 m-0 h-6 w-6 cursor-pointer appearance-none rounded-full bg-[color:var(--m-card)] shadow-[inset_0_0_0_1.5px_rgba(28,23,16,0.3)] transition-colors duration-[var(--m-dur-press)] checked:bg-[color:var(--m-ink)] checked:shadow-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                          />
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="pointer-events-none relative hidden h-4 w-4 text-[color:var(--m-on-ink)] peer-checked:block">
                            <path d="m5.5 12.5 4 4 9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-2 font-semibold ${on ? 'text-[color:var(--m-ink)]' : ''}`}>
                            <span data-testid="place-pin" aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[color:var(--m-accent)]" />
                            {place.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[length:var(--t-label)] text-[color:var(--m-text-muted)]">
                            {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                          </span>
                          <span className={`mt-1.5 block ${META}`}>“{place.evidence_quote}”</span>
                          {safeHref(place.source_reel_url) ? (
                            <a
                              href={safeHref(place.source_reel_url)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex min-h-11 items-center text-[length:var(--t-meta)] font-semibold text-[color:var(--m-accent)] underline underline-offset-2 focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]"
                            >
                              {sourceLabel(place.source_reel_url) === 'Post' ? 'Source post' : 'Source Reel'}
                            </a>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* FAB pinned at the sheet bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-stretch gap-2 bg-gradient-to-t from-[color:var(--m-page)] via-[color:var(--m-page)] to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          {maxSelected && atMax ? (
            <p className={`${TAG} self-center`}>Up to {maxSelected} places per trip</p>
          ) : null}
          <button
            type="button"
            onClick={onPlan}
            disabled={!selectedPlaceIds.length}
            className="m-btn-primary pointer-events-auto w-full disabled:cursor-default disabled:opacity-50"
          >
            {selectedPlaceIds.length ? `Plan this trip · ${selectedPlaceIds.length}${maxSelected ? ` / ${maxSelected}` : ''}` : 'Select places to plan this trip'}
          </button>
        </div>
      </section>

      {/* Reopen tab — desktop only. On desktop the collapsed sheet slides fully off the left
          edge (grip and all), so this fixed edge tab is the only way back in. On mobile the
          grip header peeks at the bottom instead, so no tab is needed there (hidden md:flex).
          Cross-fades so it isn't a dead end while the panel slides away. */}
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show places"
        aria-hidden={!collapsed}
        tabIndex={collapsed ? 0 : -1}
        data-testid="reopen-places"
        className={`absolute left-0 top-1/2 z-30 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-r-[var(--m-r-card)] bg-[color:var(--m-card)] px-2 py-5 text-[color:var(--m-text)] shadow-[var(--m-shadow-2)] transition-opacity duration-300 focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] motion-reduce:transition-none md:flex ${
          collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  )
}
