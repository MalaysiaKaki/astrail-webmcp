'use client'

import Link from 'next/link'

const FLOAT =
  'pointer-events-auto border border-[var(--line)] bg-[var(--paper-0)] shadow-[0_2px_14px_rgba(10,13,20,0.22)]'

/**
 * The phone's floating top bar: back, the trip's name and dates, and — only when the trip has
 * hotel rows — the Route / Hotel map layer switch. Title and dates live here rather than in the
 * sheet so the sheet's first screen is stops, not context.
 */
export default function MobileTopBar({
  title, dates, readOnly, showLayerToggle, layerMode, canUseHubLayer, onLayerMode,
}: {
  title: string
  dates: string
  readOnly: boolean
  showLayerToggle: boolean
  layerMode: 'route' | 'hub'
  canUseHubLayer: boolean
  onLayerMode: (mode: 'route' | 'hub') => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <Link
        href="/app/trips"
        aria-label="All trails"
        className={`${FLOAT} flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--starlight)]`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
          <polyline points="15 6 9 12 15 18" />
        </svg>
      </Link>

      <div className={`${FLOAT} flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4`}>
        <span className="type-display min-w-0 truncate text-[15px] leading-none text-[var(--starlight)]">{title}</span>
        {dates ? (
          <span className="type-body shrink-0 text-[12px] leading-none text-[var(--muted)]">{dates}</span>
        ) : null}
        {/* Said in the page, not only in the tool layer, so an agent reading it knows before it
            tries that nothing here writes. Short on screen; the full sentence is for AT. */}
        {readOnly ? (
          <span className="type-label shrink-0 rounded-full bg-[var(--brass-soft)] px-2 py-0.5 text-[12px] leading-none text-[var(--brass-bright)]">
            Sample<span className="sr-only"> trail — read-only</span>
          </span>
        ) : null}
      </div>

      {showLayerToggle ? (
        <div role="group" aria-label="Map layer" className={`${FLOAT} flex h-11 shrink-0 items-center rounded-full p-0.5`}>
          {(['route', 'hub'] as const).map((mode) => {
            const active = layerMode === mode
            const disabled = mode === 'hub' && !canUseHubLayer
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onLayerMode(mode)}
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? 'No hotel could be placed on the map' : undefined}
                className={[
                  'type-label h-10 min-w-11 rounded-full px-3 text-[13px] transition-colors',
                  active ? 'bg-[var(--brass-soft)] text-[var(--brass-bright)]' : 'text-[var(--muted)]',
                  disabled ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                {mode === 'route' ? 'Route' : 'Hotel'}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
