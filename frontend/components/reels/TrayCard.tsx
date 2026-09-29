'use client'

import type { ReelCollection } from '@/lib/reels/backend-types'

/* TrayCard — one inspiration Tray in the "Your trays" grid, drawn as a paper
   folder: the tray's reel cover peeks out of a kraft-paper pocket, with the tray
   name + reel count on the folder body (the "yaay-clean" presentation).

   Reskinned from the old dark "night" FolderGallery. The palette (palette.css)
   reserves NIGHT for the map — "the map is the only dark surface" — so a dark
   folder inside the paper trays panel read as a foreign navy blob. The folder now
   lives in the paper palette (surface-1 pocket on the paper-1 grid, brass thread
   as the single accent) and belongs on the grid.

   - The tray NAME is the accessible Open control (a <button> → onOpen). The cover
     and count are decorative; there is exactly one interactive control per card.
   - A null thumbnail renders a LIGHT paper placeholder tile, never the dark night
     one and never a broken <img> or invented geometry (guardrail #1).
   - An EMPTY tray (zero reels) still renders: the pocket shows the placeholder,
     name-as-Open-control, and a "0 reels" count, so it stays openable/renamable. */

export interface TrayCover {
  id: string | number
  /** Reel thumbnail URL; null renders a light placeholder tile, never a broken img. */
  image: string | null
  alt?: string
}

const ImageIcon = ({ size = 15, opacity = 1 }: { size?: number; opacity?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeOpacity={opacity} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

export default function TrayCard({
  collection,
  reelCount,
  photos,
  onOpen,
}: {
  collection: ReelCollection
  reelCount: number
  photos: TrayCover[]
  onOpen: (collection: ReelCollection) => void
}) {
  const cover = photos.find((p) => p.image) ?? null

  return (
    <article className="m-card relative flex flex-col gap-3 p-3">
      {/* Cover — a rounded image area; a tray with two or more reels gets a stacked-edge hint. */}
      <div className="relative">
        {reelCount > 1 ? (
          <div aria-hidden className="absolute inset-x-3 -top-1.5 h-full rounded-[var(--m-r-sub)] bg-[color:var(--m-subcard)]" />
        ) : null}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--m-r-sub)] bg-[color:var(--m-subcard)]">
          {cover?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.image} alt={cover.alt ?? ''} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[color:var(--m-accent)]">
              <ImageIcon size={28} opacity={0.5} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-1 pb-1">
        <button
          type="button"
          onClick={() => onOpen(collection)}
          className="t-card-title -mx-1 block min-h-11 w-[calc(100%+0.5rem)] truncate rounded-[var(--m-r-sub)] px-1 text-left text-[color:var(--m-text)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]"
        >
          {collection.name}
        </button>
        <span className="t-meta -mt-2 flex items-center gap-1.5">
          <ImageIcon />
          {reelCount}
          <span className="sr-only"> {reelCount === 1 ? 'reel' : 'reels'}</span>
        </span>
      </div>
    </article>
  )
}
