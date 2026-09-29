/**
 * The hero's "planned with" line, as the preferences themselves (heroPreferenceItems): a sparkle,
 * then one small accent-wash pill per preference, then "+N" for the rest. It replaced a generic
 * "Planned around your taste" badge, which said personalisation happened without saying what.
 *
 * One accessible label carries the whole statement; the pills are visual only. Pills wrap as a
 * group and a long one breaks inside itself, so the line never widens a 360–390px phone.
 * Props-only: shared by the web TripHero and the ChatGPT card's WidgetHero.
 */
import type { HeroPreferenceItems } from '@/lib/trip/insights/memory'

export type { HeroPreferenceItems }

/** The whole statement, for assistive tech. A generic line says only what it says. */
export function preferencesLabel({ items, more, generic }: HeroPreferenceItems): string {
  if (generic) return items[0] ?? ''
  return `Planned with your preferences: ${items.join(', ')}${more > 0 ? `, and ${more} more` : ''}`
}

const PILL = 'type-body inline-flex min-h-8 max-w-full items-center rounded-full bg-[var(--m-accent-wash)] px-3 py-1 text-[length:var(--t-meta)] font-medium leading-5 text-[var(--m-text)] [overflow-wrap:anywhere]'

export default function HeroPreferences({ preferences }: { preferences: HeroPreferenceItems }) {
  return (
    <div
      data-testid="personal-badge"
      role="group"
      aria-label={preferencesLabel(preferences)}
      className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden className="h-4 w-4 shrink-0 text-[var(--m-accent)]">
        <path d="M10 3.5 11.6 8.4 16.5 10l-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6Z" />
      </svg>
      {/* Index keys: two long preferences can truncate to the same visible label. */}
      {preferences.items.map((item, i) => (
        <span key={i} aria-hidden className={PILL}>{item}</span>
      ))}
      {preferences.more > 0 ? (
        <span aria-hidden className={`${PILL} tabular-nums text-[var(--m-text-muted)]`}>+{preferences.more}</span>
      ) : null}
    </div>
  )
}
