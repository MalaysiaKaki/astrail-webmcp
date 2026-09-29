'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReelCollection, SavedReelCard } from '@/lib/reels/backend-types'
import { reelLabel, sourceLabel, statusExplanation, statusLabel } from '@/lib/reels/labels'
import { safeHref } from '@/lib/safe-href'
import { DIALOG_BACKDROP, DIALOG_PANEL, META, SECTION_TITLE, SHEET_HANDLE, SUBCARD, TAG, TEXT_BUTTON } from '@/lib/shell/ui'

/* ReelInfoCard — a centered modal opened from the Library browse grid showing a saved reel's
   cover, its grounded places (name · country · evidence quote, read-only), a single header
   "View Reel" link, and an add-to-tray list.

   Standalone in T2.1a (wired into TraysScreen in T2.1b). Reuses CreateTrayDialog's overlay
   idiom (fixed backdrop + target-check close + role="dialog"), but — because it floats over the
   *interactive* Library — adds the isolation CreateTrayDialog omits: a document-level Escape
   (focus may be anywhere), and focus-restore-to-opener on close/unmount (finding C2).

   Add-to-tray is add-only and optimistic (finding C1): a successful add is recorded locally so
   the row reflects it regardless of the parent's best-effort refresh(). Adds are serialized by a
   single global lock (finding C3): while any add is in flight EVERY tray row and the New-tray row
   are disabled, blocking double-clicks and concurrent cross-row adds. onAddToTray rejects only if
   the write failed → inline error, not marked Added.

   The status/reel-label idioms are shared via lib/reels/labels (extracted once ReelBrowseGrid
   became the third caller). */

const ImageIcon = ({ size = 15, opacity = 1 }: { size?: number; opacity?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeOpacity={opacity} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

const TRAY_ROW =
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--m-r-sub)] bg-[color:var(--m-card)] px-4 text-left font-[family-name:var(--font-ui)] text-[length:var(--t-body)] font-semibold text-[color:var(--m-text)] shadow-[var(--m-shadow-1)] transition-transform duration-[var(--m-dur-press)] active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-default disabled:opacity-60'

export default function ReelInfoCard({
  card,
  collections,
  traysState,
  traysWithReel,
  onAddToTray,
  onRequestNewTray,
  onClose,
}: {
  card: SavedReelCard
  collections: ReelCollection[]
  traysState: 'loading' | 'error' | 'ready'
  traysWithReel: Set<string>
  onAddToTray: (collectionId: string) => Promise<void>
  onRequestNewTray: () => void
  onClose: () => void
}) {
  const [locallyAdded, setLocallyAdded] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  // C1 (error-path): once the tray list has rendered `ready`, latch it — a later best-effort
  // refresh() that flips traysState to loading/error must NOT replace the list (that would hide
  // the optimistic "Added ✓"). Later loading/error then shows as a non-blocking inline notice.
  const hasBeenReadyRef = useRef(false)

  const activeRef = useRef(true)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    activeRef.current = true
    openerRef.current = document.activeElement // capture the opener BEFORE moving focus
    closeButtonRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown) // document-level: focus may be anywhere
    return () => {
      activeRef.current = false
      document.removeEventListener('keydown', onKeyDown)
      const opener = openerRef.current
      if (opener instanceof HTMLElement) opener.focus() // restore focus on close/unmount
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (traysState === 'ready') hasBeenReadyRef.current = true
  }, [traysState])

  async function handleAdd(id: string) {
    setAddingId(id)
    setAddError(null)
    try {
      await onAddToTray(id) // rejects ONLY if the write failed
      if (!activeRef.current) return
      setLocallyAdded((prev) => new Set(prev).add(id)) // optimistic: survives a swallowed refresh()
    } catch (err) {
      if (!activeRef.current) return
      setAddError(err instanceof Error ? err.message : 'Could not add to that tray.')
    } finally {
      if (activeRef.current) setAddingId(null)
    }
  }

  // C1: keep showing the list once it has been ready, so a later refresh flip can't hide adds.
  const listReady = traysState === 'ready' || hasBeenReadyRef.current
  const kind = sourceLabel(card.normalized_url) // Level-1 URL-kind: 'Reel' | 'Post'

  return (
    <div
      className={DIALOG_BACKDROP}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reel-info-heading"
        className={DIALOG_PANEL}
      >
        <div aria-hidden className={SHEET_HANDLE} />
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="m-btn-icon absolute right-3 top-3 z-10"
        >
          <span aria-hidden>✕</span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Cover */}
          <div className="relative mx-4 mt-3 h-[240px] shrink-0 overflow-hidden rounded-[var(--m-r-card)] bg-[color:var(--m-subcard)] md:mt-4">
            {card.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.thumbnail_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[color:var(--m-accent)]">
                <ImageIcon size={40} opacity={0.4} />
              </div>
            )}
          </div>

          {/* Heading */}
          <div className="px-6 pt-5">
            <h2 id="reel-info-heading" className={`${SECTION_TITLE} line-clamp-2`}>
              {reelLabel(card)}
            </h2>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className={`${META} flex items-center gap-2`}>
                <span className={`${TAG} shrink-0`}>
                  {kind}
                </span>
                {statusLabel(card)}
              </span>
              <a
                href={safeHref(card.normalized_url)}
                target="_blank"
                rel="noreferrer"
                className={`${TEXT_BUTTON} shrink-0 !text-[color:var(--m-accent)]`}
              >
                {kind === 'Post' ? 'View post' : 'View Reel'}
              </a>
            </div>
          </div>

          {/* Places */}
          <div className="px-6 pt-5">
            {card.places.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {card.places.map((place) => (
                  <li key={place.place_id} className={SUBCARD}>
                    <span className="t-card-title flex items-center gap-2 text-[color:var(--m-text)]">
                      <span data-testid="place-pin" aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[color:var(--m-accent)]" />
                      {place.name}
                    </span>
                    <span className={`${META} mt-0.5 block`}>{place.country_name}</span>
                    <span className={`${META} mt-1.5 block`}>“{place.evidence_quote}”</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${SUBCARD} ${META}`}>
                {/* statusLabel, NOT STATUS_LABELS: the raw map has no idea a failure was a used-up
                    daily allowance rather than a broken reel, and this is the surface someone
                    opens precisely to find out which. */}
                {`No places found yet — ${statusLabel(card)}.`}
                {statusExplanation(card) ? (
                  <span className="mt-1.5 block">{statusExplanation(card)}</span>
                ) : null}
              </p>
            )}
          </div>

          {/* Add to a tray */}
          <div className="px-6 pb-6 pt-5">
            <h3 className="t-card-title mb-3 text-[color:var(--m-text)]">Add to a tray</h3>

            {addError ? (
              <p role="alert" className={`${SUBCARD} ${META} mb-3`}>
                {addError}
              </p>
            ) : null}

            {!listReady && traysState === 'loading' ? (
              <p className={META}>Loading your trays…</p>
            ) : (
              <>
                {listReady && traysState !== 'ready' ? (
                  <p role="status" className={`${META} mb-2`}>
                    {traysState === 'loading'
                      ? 'Refreshing your trays…'
                      : "Couldn't refresh your trays — showing your last version."}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {!listReady && traysState === 'error' ? (
                    <li className={`${SUBCARD} ${META}`}>
                      {"Couldn't load your trays."}
                    </li>
                  ) : (
                    collections.map((c) => {
                      const added = traysWithReel.has(c.id) || locallyAdded.has(c.id)
                      const isAdding = addingId === c.id
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={added || addingId !== null}
                            onClick={() => void handleAdd(c.id)}
                            className={TRAY_ROW}
                          >
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0 text-[color:var(--m-accent)]">
                              {added ? 'Added ✓' : isAdding ? 'Adding…' : 'Add'}
                            </span>
                          </button>
                        </li>
                      )
                    })
                  )}
                  <li>
                    <button
                      type="button"
                      disabled={addingId !== null}
                      onClick={onRequestNewTray}
                      className={`${TRAY_ROW} !text-[color:var(--m-accent)]`}
                    >
                      + New tray…
                    </button>
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
