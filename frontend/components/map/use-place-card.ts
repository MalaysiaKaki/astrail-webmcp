'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { getControlRects } from '@/lib/trip/control-obstruction'
import { getPanelObstruction } from '@/lib/trip/panel-obstruction'
import { getPlacementObstacles } from '@/lib/trip/placement-obstacles'
import { mapHasCardRoom, solveCardPlacement, type Box, type CardAnchor } from './card-placement'

/**
 * The desktop place card's Mapbox shell (A10; Codex map-card review §1–§2), owned by the trip
 * route's TripMap and never by MapProvider or a Marker: release() stops the shared map and removes
 * markers, not popups, so this hook removes its own on every exit.
 *
 * One host element for the card's whole life, React-portalled into by TripMap. The Popup around it
 * is only a shell: Mapbox has no public way to change an anchor, so a new anchor means a new
 * Popup around the SAME host (the React content, its state and focus survive).
 *
 * Placement, per opening request (nonce):
 *   hidden until placed → wait for the selection's flight to settle → solve against the measured
 *   panel, controls, dock and day chip → anchor it, or spend ONE bounded camera correction (panBy,
 *   zoom, pitch and bearing kept), or hand the detail to the sidebar (onFallback).
 * After that only the anchor follows: on camera moves, content resize and chrome changes. A user
 * gesture cancels a correction not yet spent; the camera is never dragged back.
 */

export type MapCard = {
  /** The opening request: a new nonce is a new open, even of the same place. */
  nonce: number
  /** Where the card points. */
  at: [number, number]
}

const OFFSET = 30          // the avatar's radius plus the pointer
const MARGIN = 12
const MIN_HEIGHT = 260     // header, the evidence, the actions
const TIP = 10             // Mapbox's popup pointer
const EST = { w: 360, h: 420 }   // before layout (jsdom, first frame): a typical card

type Opts = {
  getMap: () => mapboxgl.Map | null
  ready: boolean
  card: MapCard | null
  /** The detail cannot be shown at the pin: show it in the sidebar. */
  onFallback: (nonce: number) => void
  /** A click on the empty map closes the card. */
  onDismiss: () => void
  /** Focus moves into the card once placed, unless something else owns it (an approval). */
  mayTakeFocus: () => boolean
  /** Placed, moved or closed: the name pills re-place around the card. */
  onLayout?: () => void
  /** Re-place when these change (panel, controls, dock, day chip, layout). */
  deps: readonly unknown[]
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function typing(el: Element | null): boolean {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
}

export function usePlaceCard({ getMap, ready, card, onFallback, onDismiss, mayTakeFocus, onLayout, deps }: Opts) {
  const [host] = useState(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('div'), { className: 'place-card-host' })))
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const anchorRef = useRef<CardAnchor | null>(null)
  const cardRef = useRef(card)
  cardRef.current = card
  /** The request whose card is placed and visible, and the one whose correction is spent. */
  const placedRef = useRef<number | null>(null)
  const correctedRef = useRef<number | null>(null)
  const focusedRef = useRef<number | null>(null)
  /** The card's rect in map-container px while shown: a local obstacle for the name pills. */
  const rectRef = useRef<Box | null>(null)
  /** The correction's pending moveend callback, cancelled with the request (Codex final #5). */
  const cancelCorrectionRef = useRef<(() => void) | null>(null)
  /** The route has left: nothing may place, fall back or build a shell any more. */
  const disposedRef = useRef(false)
  const cbRef = useRef({ onFallback, onDismiss, mayTakeFocus, onLayout })
  cbRef.current = { onFallback, onDismiss, mayTakeFocus, onLayout }

  function removePopup() {
    popupRef.current?.remove()
    popupRef.current = null
    anchorRef.current = null
    rectRef.current = null
  }

  /** A shell at `anchor` around the one host; the old shell goes after the host has moved. */
  function shell(map: mapboxgl.Map, at: [number, number], anchor: CardAnchor, hidden: boolean) {
    if (!host) return
    const hadFocus = host.contains(document.activeElement)
    const old = popupRef.current
    const popup = new mapboxgl.Popup({
      anchor, offset: OFFSET, closeButton: false, closeOnClick: false, closeOnMove: false,
      focusAfterOpen: false, maxWidth: 'none',
      className: ['place-card-popup', hidden ? 'place-card-popup--measuring' : ''].filter(Boolean).join(' '),
    }).setLngLat(at).setDOMContent(host).addTo(map)
    popupRef.current = popup
    anchorRef.current = anchor
    old?.remove()
    if (hadFocus) host.querySelector<HTMLElement>('[data-place-card]')?.focus({ preventScroll: true })
  }

  function measure(): { w: number; natural: number } {
    const el = host?.querySelector<HTMLElement>('[data-place-card]')
    const head = el?.querySelector<HTMLElement>('[data-card-header]')
    const body = el?.querySelector<HTMLElement>('[data-card-body]')
    const w = el?.offsetWidth || EST.w
    const natural = head && body && (head.offsetHeight || body.scrollHeight)
      ? head.offsetHeight + body.scrollHeight + TIP
      : EST.h
    return { w, natural }
  }

  /** Solve for the open card. `allowShift`: this request may still spend its correction. */
  function place(allowShift: boolean): void {
    const map = getMap()
    const c = cardRef.current
    if (disposedRef.current || !map || !c || !host) return
    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null
    const origin = container?.getBoundingClientRect?.() ?? { left: 0, top: 0 }
    const view = { w: canvas?.clientWidth || window.innerWidth, h: canvas?.clientHeight || window.innerHeight }
    const toLocal = (r: Box) => ({ ...r, x: r.x - origin.left, y: r.y - origin.top })
    const panelRight = Math.max(0, getPanelObstruction() - origin.left)
    const pin = typeof map.project === 'function' ? map.project(c.at) : null
    const size = measure()
    const result = solveCardPlacement({
      pin: pin ? { x: pin.x, y: pin.y } : null,
      card: size,
      view,
      obstacles: [
        ...(panelRight > 0 ? [{ x: 0, y: 0, w: panelRight, h: view.h }] : []),
        ...getControlRects().map(toLocal),
        ...getPlacementObstacles().map(toLocal),
      ],
      offset: OFFSET, margin: MARGIN, minHeight: MIN_HEIGHT,
      current: placedRef.current === c.nonce ? anchorRef.current : null,
      panelRight,
    })
    if (result.kind === 'fit') {
      host.style.setProperty('--place-card-max-h', `${Math.round(result.maxHeight - TIP)}px`)
      if (result.anchor !== anchorRef.current || placedRef.current !== c.nonce) shell(map, c.at, result.anchor, false)
      rectRef.current = result.rect
      placedRef.current = c.nonce
      cbRef.current.onLayout?.()
      if (focusedRef.current !== c.nonce) {
        focusedRef.current = c.nonce
        if (cbRef.current.mayTakeFocus() && !typing(document.activeElement)) {
          host.querySelector<HTMLElement>('[data-place-card]')?.focus({ preventScroll: true })
        }
      }
      return
    }
    // Placed already, and the camera, the chrome or the content moved so that no anchor fits where
    // the pin is now (a fitting one re-anchored above). A placed card never moves the camera again
    // (a user pan is theirs), so 'shift' is no better than 'none' here: the map shrank, chrome grew
    // over the card, or the pin left the map. The detail moves to the sidebar (Codex #4, A12).
    if (placedRef.current !== c.nonce && result.kind === 'shift' && allowShift && correctedRef.current !== c.nonce) {
      correctedRef.current = c.nonce
      const nonce = c.nonce
      const after = () => {
        cancelCorrectionRef.current = null
        if (!disposedRef.current && cardRef.current?.nonce === nonce) place(false)
      }
      map.once('moveend', after)
      cancelCorrectionRef.current = () => { map.off?.('moveend', after); cancelCorrectionRef.current = null }
      map.panBy([-result.dx, -result.dy], { duration: reducedMotion() ? 0 : 450, essential: true })
      return
    }
    removePopup()
    placedRef.current = null
    cbRef.current.onLayout?.()
    cbRef.current.onFallback(c.nonce)
  }

  // Open / move to a new request. Hidden until placed; placed once the selection's flight lands.
  useEffect(() => {
    const map = getMap()
    if (!ready || !map || !card) {
      const was = placedRef.current !== null
      removePopup()
      placedRef.current = null
      if (was) cbRef.current.onLayout?.()
      // An unloaded map (or one that never loads) is reported by TripMap as unavailable, and the
      // owner then keeps the detail in the sidebar (Codex final #2); nothing to do here.
      return
    }
    const nonce = card.nonce
    placedRef.current = null
    // A map too narrow for any card (768 with the panel open) is known now: no reason to make the
    // reader wait out the selection's flight before the sidebar shows the detail.
    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null
    const left = map.getContainer?.()?.getBoundingClientRect?.().left ?? 0
    if (!mapHasCardRoom(canvas?.clientWidth || window.innerWidth, Math.max(0, getPanelObstruction() - left), EST.w)) {
      removePopup()
      cbRef.current.onFallback(nonce)
      return
    }
    shell(map, card.at, anchorRef.current ?? 'top', true)
    let cancelled = false
    const settle = () => { if (!cancelled && cardRef.current?.nonce === nonce) place(true) }
    // The next frame: React has committed the content, and a flight issued in this commit (the
    // selection effect runs first) has set the map moving.
    const frame = requestAnimationFrame(() => {
      if (cancelled) return
      if (map.isMoving?.()) map.once('moveend', settle)
      else settle()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      map.off?.('moveend', settle)
      cancelCorrectionRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, card?.nonce])

  // Only the anchor follows: every settled camera move, a chrome change, the card's own resize.
  useEffect(() => {
    const map = getMap()
    if (!ready || !map || typeof map.on !== 'function') return
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (placedRef.current !== null && cardRef.current) place(false) })
    }
    // A user gesture spends the pending correction: the camera is theirs now.
    const gesture = (e: object) => {
      if ((e as { originalEvent?: unknown })?.originalEvent && cardRef.current) correctedRef.current = cardRef.current.nonce
    }
    const click = (e: { originalEvent?: Event }) => {
      const target = e?.originalEvent?.target as Element | null | undefined
      if (!cardRef.current || target?.closest?.('.mapboxgl-marker, .mapboxgl-popup, [data-pin-place-id], .eat-pin, .hotel-hub-pin')) return
      cbRef.current.onDismiss()
    }
    map.on('moveend', follow)
    for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) map.on(ev, gesture)
    map.on('click', click)
    const ro = host && typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null
    if (host) ro?.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      map.off?.('moveend', follow)
      for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) map.off?.(ev, gesture)
      map.off?.('click', click)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useEffect(() => {
    if (placedRef.current === null || !cardRef.current) return
    place(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Leaving the route: the shared map outlives it, so the shell must not.
  // Declared before TripMap's own teardown effect, so this runs BEFORE release() stops the map:
  // stop() emits moveend synchronously, and no pending callback may place on a departed route.
  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      cancelCorrectionRef.current?.()
      removePopup()
    }
  }, [])

  return { host, cardRect: () => rectRef.current, isOpen: () => placedRef.current !== null }
}
