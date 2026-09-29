'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseTripTab, type TripTab } from '@/lib/trip/reveal'

/**
 * Reads `?tab=` once, on load, and hands it to the workspace's tab state (lib/trip/use-trip-tab).
 * Its own Suspense boundary: useSearchParams opts the nearest boundary out of static prerendering,
 * and without one `next build` fails the whole route. It renders nothing either way.
 */
function Reader({ onTab }: { onTab: (tab: TripTab | null) => void }) {
  const raw = useSearchParams()?.get('tab') ?? null
  useEffect(() => {
    onTab(parseTripTab(raw))
    // Load only: every later change to ?tab= is written BY the tab state, never read back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function TripTabUrl({ onTab }: { onTab: (tab: TripTab | null) => void }) {
  return (
    <Suspense fallback={null}>
      <Reader onTab={onTab} />
    </Suspense>
  )
}
