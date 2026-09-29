import type { TripBundle } from './backend-types'
import { reelKey } from '@/components/map/popup-model'
import { safeHref } from '@/lib/safe-href'
import { formatRoutedDistance, tripStats } from './trip-stats'

/** How many Reel covers the hero's cluster shows before "+N". */
export const HERO_MAX_COVERS = 4

/**
 * The hero's Reel cover cluster: the Reels behind this trip, from the loader's reconstructed
 * `bundle.inspiration`, deduplicated by canonical URL (amendment 3), with their covers where the
 * cache has one. A Reel without a cover still counts toward "+N"; a requested-place row (no URL)
 * is not a Reel. Covers are untrusted URLs and pass the same protocol check as any link.
 */
export function heroCovers(bundle: TripBundle): { covers: string[]; reels: number; extra: number } {
  const seen = new Map<string, string | null>()
  for (const i of bundle.inspiration) {
    if (!i.normalized_reel_url) continue
    const key = reelKey(i.normalized_reel_url)
    const cover = i.thumbnail_url ? safeHref(i.thumbnail_url) ?? null : null
    if (!seen.has(key) || (seen.get(key) === null && cover)) seen.set(key, cover)
  }
  const covers = [...seen.values()].filter((c): c is string => c !== null).slice(0, HERO_MAX_COVERS)
  return { covers, reels: seen.size, extra: Math.max(0, seen.size - covers.length) }
}

/**
 * The hero's stat chips: Places, Days and routed distance, by the existing honest rule
 * (lib/trip/trip-stats): distance only from legs the router actually routed, and no chip at all
 * rather than "0 km" when there are none.
 */
export function heroStats(bundle: TripBundle): { label: string; value: string }[] {
  const s = tripStats(bundle)
  const routed = formatRoutedDistance(s.routedMeters)
  return [
    { label: 'Places', value: String(s.places) },
    { label: 'Days', value: String(s.days) },
    ...(routed === '—' ? [] : [{ label: 'Routed', value: routed }]),
  ]
}
