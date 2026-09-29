import Link from 'next/link'
import type { ReactNode } from 'react'

/** Sentence-case chip on the kit sub-card surface. `tone` adds a status dot; text stays ink for AA. */
export function Chip({ children, tone, dataAttr }: {
  children: ReactNode
  tone?: 'ok' | 'accent' | 'warn' | 'fail' | 'muted'
  dataAttr?: string
}) {
  const dot = tone ? {
    ok: 'var(--ok-day)', accent: 'var(--m-accent)', warn: 'var(--warn-day)', fail: 'var(--fail-day)', muted: 'var(--m-text-muted)',
  }[tone] : null
  return (
    <span
      {...(dataAttr ? { [`data-${dataAttr}`]: '' } : {})}
      className="t-label inline-flex min-h-6 items-center gap-1.5 rounded-[var(--m-r-pill)] bg-[var(--m-subcard)] px-2.5 py-0.5 text-[var(--m-text)]"
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
      {children}
    </span>
  )
}

export function SectionHeading({ id, children, sub }: { id: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <h3 id={id} className="t-title text-[var(--m-text)]">{children}</h3>
      {sub ? <p className="t-meta">{sub}</p> : null}
    </div>
  )
}

export function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="m-chevron">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/** A kit card link to Settings, where the traveller sees and edits what Astrail remembers now. */
export function SettingsCardLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/app/settings" className="m-card-link t-body font-semibold">
      <span className="min-w-0">{children}</span>
      <ChevronRight />
    </Link>
  )
}

export function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  )
}

export function formatDay(iso: string): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
