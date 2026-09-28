'use client'

import Link from 'next/link'
import Astronaut from '@/components/mascot/Astronaut'

/**
 * The trip route's non-trip states on a phone — loading, not found, failed, still generating —
 * as one kit card each: centred, serif heading, a primary pill action (and a secondary one when
 * there is a second way out), clear of the notch and home indicator.
 *
 * Same words and the same gates as the desktop screens in TripWorkspace; only the surface
 * changes. Loading and generating float over the shared map (it is held on screen behind them for
 * the dawn relight), so their page is transparent; failed and not-found sit on the paper page.
 */
export function StateScreen({ overMap = false, children }: { overMap?: boolean; children: React.ReactNode }) {
  return (
    <main
      className={[
        'paper-scope mobile-trip flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto',
        'px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]',
        overMap ? 'pointer-events-none relative bg-transparent' : 'bg-[var(--m-page)]',
      ].join(' ')}
    >
      <div data-state-card className="m-card pointer-events-auto flex w-full max-w-sm flex-col items-center gap-3 px-6 py-7 text-center">
        {children}
      </div>
    </main>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="type-display text-[24px] leading-tight text-[var(--m-text)]">{children}</h1>
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="type-body max-w-[32ch] text-[15px] leading-relaxed text-[var(--m-text-muted)]">{children}</p>
}

/** A brass dot that breathes while the page is genuinely still working (reduced motion: still). */
function LiveDot() {
  return <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--m-accent)] motion-safe:animate-pulse" />
}

export function PhoneLoading({ arriving }: { arriving: boolean }) {
  if (arriving) {
    // The arrival, not a new page: the generation's astronaut carries across the handoff.
    return (
      <StateScreen overMap>
        <div data-testid="trip-arrival" className="flex flex-col items-center gap-3">
          <Astronaut size={48} variant="idle" />
          <Heading>Your trip is ready</Heading>
          <p className="type-body flex items-center gap-2 text-[15px] text-[var(--m-text-muted)]">
            <LiveDot />
            Opening your map…
          </p>
        </div>
      </StateScreen>
    )
  }
  return (
    <StateScreen overMap>
      <p role="status" className="type-body flex items-center gap-2.5 text-[16px] text-[var(--m-text)]">
        <LiveDot />
        Loading trip…
      </p>
    </StateScreen>
  )
}

export function PhoneNotFound() {
  return (
    <StateScreen>
      <Heading>Trip not found.</Heading>
      <Body>It may have been deleted, or this link points somewhere else.</Body>
      <Link href="/app/trips" className="m-btn-primary mt-2 w-full">All trails</Link>
    </StateScreen>
  )
}

/** `feedback` is the composer block, passed in so the gate stays in TripWorkspace with desktop's. */
export function PhoneFailed({ feedback }: { feedback: React.ReactNode }) {
  return (
    <StateScreen>
      <Heading>Generation failed</Heading>
      <Body>Astrail couldn&apos;t build this trip. Start a new one — repeat Reels are cached, so retrying is fast.</Body>
      <a href="/app" className="m-btn-primary mt-2 w-full">Plan a new trip</a>
      {feedback ? <div className="mt-3 w-full border-t border-[rgba(28,23,16,0.08)] pt-4 text-left">{feedback}</div> : null}
    </StateScreen>
  )
}

export function PhoneGenerating() {
  return (
    <StateScreen overMap>
      <LiveDot />
      <Heading>Still generating</Heading>
      <Body>Your trail is still being built — refresh in a moment.</Body>
      <button type="button" onClick={() => window.location.reload()} className="m-btn-primary mt-2 w-full">
        Refresh
      </button>
      <Link href="/app/trips" className="m-btn-secondary w-full">All trails</Link>
    </StateScreen>
  )
}
