'use client'

import { useState } from 'react'
import type { TripPlace } from '@/lib/trip/backend-types'
import type { StopProvenance } from '@/lib/trip/stop-provenance'
import { safeHref } from '@/lib/safe-href'
import { evidenceKindLabel } from '@/lib/trip/evidence-kind'

/*
 * The pieces of a stop's detail, shared by the phone/sidebar StopCard and the desktop map place
 * card (A10), so the two surfaces render one evidence contract: verbatim quotes as React text,
 * safe links, confidence only where asked and never for a stop the traveller requested.
 */

/** The provenance line's label. A bounded view that dropped quotes (captionOmitted) cannot say a
 *  Reel stop had no caption evidence — only that this view does not include it. */
export function provenanceLabel(p: StopProvenance, captionOmitted = false): string {
  return p.kind === 'none' && captionOmitted ? 'Caption not included in this view' : p.label
}

export function humanize(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * The nested evidence sub-card. Only when there is evidence text to show: a Reel stop without a
 * quote says "No caption evidence" in its meta line and gets no sub-card, rather than a grey box
 * that looks like it is holding something. A suggestion's rationale is Astrail's words, so it is
 * never dressed in quote marks.
 */
export function Evidence({ p, thumbnail, full }: { p: StopProvenance; thumbnail: string | null; full: boolean }) {
  if (!p.text) return null
  const quoted = p.kind === 'reel' || p.kind === 'requested'
  const src = thumbnail ? safeHref(thumbnail) : undefined
  return (
    <span data-evidence className="m-subcard mt-2.5 flex w-full items-center gap-3 p-2">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-[0_1px_3px_rgba(28,23,16,0.18)]" />
      ) : null}
      {/* Verbatim, never transformed: upright, clamped to two lines until the card is opened. */}
      <span className={['type-body min-w-0 text-[15px] leading-snug text-[rgba(28,23,16,0.78)]', full ? '' : 'line-clamp-2'].join(' ')}>
        {quoted ? `“${p.text}”` : p.text}
      </span>
    </span>
  )
}

/**
 * The map card's evidence: the Reel still larger, the quote clamped to four lines with "More" to
 * read the rest. The one picture on the card, so it leads.
 */
export function CardEvidence({ p, thumbnail }: { p: StopProvenance; thumbnail: string | null }) {
  const [open, setOpen] = useState(false)
  if (!p.text) return null
  const quoted = p.kind === 'reel' || p.kind === 'requested'
  const src = thumbnail ? safeHref(thumbnail) : undefined
  const long = p.text.length > 150
  return (
    <div data-evidence className="m-subcard flex w-full items-start gap-3 p-2.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover shadow-[0_1px_3px_rgba(28,23,16,0.18)]" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className={['t-body min-w-0 leading-snug text-[rgba(28,23,16,0.78)]', open || !long ? '' : 'line-clamp-4'].join(' ')}>
          {quoted ? `“${p.text}”` : p.text}
        </p>
        {long ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="t-meta -ml-2 min-h-11 rounded-full px-2 font-semibold text-[var(--m-accent)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]">
            {open ? 'Less' : 'More'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function WhereLine({ tp, located }: { tp: TripPlace; located: boolean }) {
  const { place } = tp
  const where = [place.area, place.city, place.country].filter(Boolean).join(', ')
  return (
    <p className="type-body flex items-start gap-2 text-[14px] text-[var(--m-text-muted)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden className="mt-0.5 h-4 w-4 shrink-0">
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
        <circle cx="12" cy="10" r="2.3" />
      </svg>
      <span className="min-w-0 [overflow-wrap:anywhere]">{located ? where || 'On the map' : 'Location unavailable — this stop could not be placed on the map.'}</span>
    </p>
  )
}

export function ConfidenceChip({ tp, confidence }: { tp: TripPlace; confidence: number }) {
  return (
    <p data-evidence-chip className="type-body self-start rounded-full bg-[var(--m-subcard)] px-3 py-1 text-[var(--m-text-muted)] text-[length:var(--t-meta)] leading-[1.45]">
      <span className="font-semibold text-[var(--m-accent)]">{evidenceKindLabel(tp.evidence_json.evidence_kind)}</span>
      <span aria-hidden> · </span>
      {confidence}% confidence
    </p>
  )
}

const EXTERNAL = 'M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4'

/** Watch the Reel, the research Source, and Show in 3D. Nothing when none applies. */
export function StopActions({ reel, source, onShow3d }: {
  reel: string | undefined
  source: string | undefined
  onShow3d?: () => void
}) {
  if (!reel && !source && !onShow3d) return null
  return (
    <div className="flex flex-wrap gap-2">
      {reel ? (
        <a href={reel} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
          Watch the Reel
          <span className="sr-only"> (opens in a new tab)</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d={EXTERNAL} />
          </svg>
        </a>
      ) : null}
      {source && source !== reel ? (
        <a href={source} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
          Source
          <span className="sr-only"> (opens in a new tab)</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d={EXTERNAL} />
          </svg>
        </a>
      ) : null}
      {onShow3d ? (
        <button type="button" onClick={onShow3d} className="m-btn-secondary">
          <span aria-hidden className="font-bold tracking-[0.02em] text-[length:var(--t-meta)] leading-[1.45]">3D</span>
          Show in 3D
        </button>
      ) : null}
    </div>
  )
}
