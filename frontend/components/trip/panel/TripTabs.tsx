'use client'

import { useRef } from 'react'
import { TRIP_TABS, type TripTab } from '@/lib/trip/reveal'

export const tabId = (t: TripTab) => `trip-tab-${t}`
export const panelId = (t: TripTab) => `trip-tabpanel-${t}`

/**
 * The panel's segmented control (plan v2 §2): Trip · For you · How it was built, as a Placify pill.
 *
 * WAI-ARIA tabs with automatic activation: one tab stop (roving tabindex), ←/→ move and select,
 * Home/End jump. Each tab is a 44px target. The selected tab is the white pill on the grey track;
 * the colour is never the only signal (aria-selected, and a heavier weight).
 */
export default function TripTabs({ tab, onTab }: { tab: TripTab; onTab: (tab: TripTab) => void }) {
  const refs = useRef<Partial<Record<TripTab, HTMLButtonElement | null>>>({})
  const move = (next: TripTab) => {
    onTab(next)
    refs.current[next]?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TRIP_TABS.findIndex((t) => t.id === tab)
    const last = TRIP_TABS.length - 1
    const to = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
        : e.key === 'Home' ? 0
          : e.key === 'End' ? last
            : null
    if (to === null) return
    e.preventDefault()
    move(TRIP_TABS[to].id)
  }
  return (
    <div
      role="tablist"
      aria-label="Trip sections"
      onKeyDown={onKeyDown}
      className="flex rounded-full bg-[var(--m-subcard)] p-1"
    >
      {TRIP_TABS.map((t) => {
        const selected = t.id === tab
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el }}
            type="button"
            role="tab"
            id={tabId(t.id)}
            aria-selected={selected}
            aria-controls={panelId(t.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTab(t.id)}
            className={[
              'type-body min-h-11 flex-auto whitespace-nowrap rounded-full px-3 text-[length:var(--t-meta)] leading-tight',
              'transition-[background-color,box-shadow,transform] duration-[var(--m-dur-press)] active:scale-[0.97]',
              'motion-reduce:transition-none motion-reduce:active:scale-100',
              'focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]',
              selected
                ? 'bg-[var(--m-card)] font-semibold text-[var(--m-text)] shadow-[0_1px_3px_rgba(28,23,16,0.14)]'
                : 'font-medium text-[var(--m-text-muted)] hover:text-[var(--m-text)]',
            ].join(' ')}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
