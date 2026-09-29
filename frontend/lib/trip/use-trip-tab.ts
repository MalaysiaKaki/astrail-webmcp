'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseTripTab, type TripTab } from './reveal'

/**
 * Which trip panel tab is open, for this trip, for this browser session.
 *
 * Precedence (amendment 9): a `?tab=` in the URL wins on load; otherwise the tab this trip had
 * earlier in the session (sessionStorage, per trip id); otherwise Trip. A change writes both, and
 * rewrites the URL with `replaceState` — a tab is a view of the page, not a navigation, so Back
 * leaves the trip instead of stepping through tabs.
 *
 * The URL is read by <TripTabUrl/> (useSearchParams, inside a Suspense boundary so `next build`
 * can prerender the page) and handed in through `applyUrl`. Child effects run before this hook's,
 * but a Suspense boundary can also resolve after it, so the URL is honoured in either order: the
 * stored tab is applied only when no URL tab arrived first, and a URL tab always applies.
 *
 * Starts at Trip on the server and in hydration, so SSR and the first client render agree.
 */
const KEY = (tripId: string) => `astrail:trip-tab:${tripId}`

function readStored(tripId: string): TripTab | null {
  try { return parseTripTab(window.sessionStorage.getItem(KEY(tripId))) } catch { return null }
}

function writeStored(tripId: string, tab: TripTab): void {
  try { window.sessionStorage.setItem(KEY(tripId), tab) } catch { /* the tab still changes */ }
}

function writeUrl(tab: TripTab): void {
  try {
    const url = new URL(window.location.href)
    if (tab === 'trip') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  } catch { /* an exotic embed without history: the tab still changes */ }
}

export function useTripTab(tripId: string): {
  tab: TripTab
  setTab: (tab: TripTab) => void
  applyUrl: (tab: TripTab | null) => void
} {
  const [tab, setTabState] = useState<TripTab>('trip')
  const urlApplied = useRef(false)

  useEffect(() => {
    if (urlApplied.current) return
    const stored = readStored(tripId)
    if (stored) setTabState(stored)
  }, [tripId])

  const setTab = useCallback((next: TripTab) => {
    setTabState(next)
    writeStored(tripId, next)
    writeUrl(next)
  }, [tripId])

  const applyUrl = useCallback((fromUrl: TripTab | null) => {
    if (!fromUrl) return
    urlApplied.current = true
    setTabState(fromUrl)
    writeStored(tripId, fromUrl)
  }, [tripId])

  return { tab, setTab, applyUrl }
}
