import mapboxgl from 'mapbox-gl'
import type { TripBundle } from '@/lib/trip/backend-types'
import { buildPlaceIndex, hasRealCoords, selectedHotel } from '@/lib/trip/selectors'
import { buildEatPopup, buildStayPopup } from './suggestion-popup'

/**
 * The phone's DOM card for an eat or hotel suggestion (every width without a place-card owner),
 * moved out of TripMap.tsx (A11). One at a time across every layer.
 *
 * `drop()` clears its ref BEFORE removing, so a replacement or a teardown is never mistaken for
 * the user's close; a user close (its ✕, a map click) calls `onDismiss`, so the owner's open card
 * closes with it and a later rotation does not bring back a dismissed card (Codex final #6).
 */
export function createDomSuggestionCard(getMap: () => mapboxgl.Map | null, onDismiss: () => void) {
  let current: mapboxgl.Popup | null = null

  function drop() {
    const popup = current
    current = null
    popup?.remove()
  }

  function open(at: [number, number], content: HTMLElement) {
    const map = getMap()
    if (!map) return
    drop()
    const popup = new mapboxgl.Popup({
      // The light kit card (phone-map-cards.css) at every width since plan A6.
      className: 'astrail-evidence-popup phone-popup',
      closeButton: true, closeOnClick: true, offset: 16, maxWidth: '300px',
    }).setLngLat(at).setDOMContent(content).addTo(map)
    current = popup
    popup.on?.('close', () => {
      if (current !== popup) return
      current = null
      onDismiss()
    })
  }

  /** The card for an open eat or hotel, built as the eat and hub flows build it. */
  function openFor(bundle: TripBundle, s: { kind: 'eat' | 'hotel'; id: string }) {
    if (s.kind === 'eat') {
      const r = bundle.restaurants.find((x) => x.restaurant_place_id === s.id)
      const place = bundle.suggestion_places.find((p) => p.id === s.id) ?? buildPlaceIndex(bundle).get(s.id)
      if (!r || !place || !hasRealCoords(place.lng, place.lat)) return
      const near = r.near_place_id ? buildPlaceIndex(bundle).get(r.near_place_id)?.name ?? null : null
      open([place.lng, place.lat], buildEatPopup(r, place, near))
      return
    }
    const hub = selectedHotel(bundle, s.id)
    if (hub && hub.geo_status === 'placed' && hub.lng !== null && hub.lat !== null && hasRealCoords(hub.lng, hub.lat)) {
      open([hub.lng, hub.lat], buildStayPopup(hub))
    }
  }

  return { open, openFor, drop }
}
