'use client'

import type { TripPlace } from '@/lib/trip/backend-types'
import type { StopProvenance } from '@/lib/trip/stop-provenance'
import { safeHref } from '@/lib/safe-href'
import { humanize, provenanceLabel } from './StopParts'

/**
 * One stop in the desktop sidebar's navigator (A10 item 4): number, the Reel still, the name, the
 * category and provenance. Its detail opens as the place card at the pin on the map, so the row is
 * a dialog opener (aria-haspopup) that marks the current place (aria-current), never a disclosure:
 * nothing expands under it. Grows with text zoom rather than clipping at its 64px minimum.
 */
export default function CompactStopRow({ tp, pin, total, provenance: p, thumbnail, selected, onTap, captionOmitted = false }: {
  tp: TripPlace
  pin: number | undefined
  total: number
  provenance: StopProvenance
  thumbnail: string | null
  selected: boolean
  onTap: () => void
  /** See StopCard: a bounded view's dropped caption is not "no caption evidence". */
  captionOmitted?: boolean
}) {
  const src = thumbnail ? safeHref(thumbnail) : undefined
  return (
    <button
      type="button"
      data-place-id={tp.place_id}
      data-compact-stop
      aria-current={selected ? 'true' : undefined}
      aria-haspopup="dialog"
      onClick={onTap}
      // Inline: the kit's unlayered .m-card-link padding and 56px minimum beat utility classes.
      style={{ minHeight: 64, paddingBlock: 10, paddingLeft: 14 }}
      className={[
        'm-card-link w-full text-left',
        selected ? 'outline-2 outline-solid outline-[var(--m-ink)]' : '',
      ].join(' ')}
    >
      <span className="relative shrink-0">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="h-11 w-11 rounded-xl object-cover" />
        ) : (
          <span aria-hidden className="block h-11 w-11 rounded-xl bg-[var(--m-accent-wash)]" />
        )}
        <span
          data-badge
          className={[
            't-label absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-semibold tabular-nums shadow-[0_0_0_2px_var(--m-card)]',
            pin != null ? 'bg-[var(--m-ink)] text-[var(--m-on-ink)]' : 'border-2 border-dashed border-[rgba(28,23,16,0.28)] bg-[var(--m-card)]',
          ].join(' ')}
        >
          {pin != null ? pin : ''}
        </span>
      </span>
      <span className="sr-only">{pin != null ? `Stop ${pin} of ${total}` : 'Unnumbered stop'}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-card-title truncate text-[var(--m-text)]">{tp.place.name}</span>
        <span className="t-meta truncate">
          <span>{humanize(tp.place.place_type)}</span>
          <span aria-hidden> · </span>
          <span className={p.kind === 'none' ? '' : 'font-medium text-[var(--m-accent)]'}>{provenanceLabel(p, captionOmitted)}</span>
        </span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden className="m-chevron">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  )
}
