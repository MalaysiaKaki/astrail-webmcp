import type { HotelSuggestion, Place, RestaurantSuggestion } from '@/lib/trip/backend-types'

/**
 * Popups for the two SUGGESTION layers — "Where to eat" and "Where to stay".
 *
 * Separate from `popup-model.ts`, which answers "why is this stop on MY trip". A suggestion is not
 * a stop: it has no day position, no arrival leg and no Reel behind it, so the trip-relative
 * framing there would be mostly empty fields. What a traveller wants here is narrower — what kind
 * of place is it, why did Astrail pick it, and what will it cost.
 *
 * NOT SHOWN, and not an oversight: opening hours, photos, phone numbers, review counts. None of it
 * exists in the schema — no column, no table, no provider — and Travala returns no image either.
 * A plausible "Open until 18:00" that we inferred is precisely the hallucinated-detail failure
 * guardrail #1 exists to prevent, on a product whose promise is that every claim is backed.
 *
 * NEITHER card shows "matches your taste", though `preference_match_json` exists on both types.
 * `persist_restaurants` and `persist_hotels` insert `{}` literally — "stays {} until prefs are
 * wired (Step 9)" — and a live check of both tables found `{}` on every row. It rendered for the
 * fixture and never once in production. A section that is always empty on real data is worse than
 * no section, and a field that exists is not evidence that anything fills it.
 *
 * Every value is written with textContent. Restaurant summaries are model-written and hotel names
 * come from a third-party API; neither is ever parsed as markup.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** `price_snapshot` is `Record<string, unknown>` — a jsonb column, so every read is a guess until
 *  checked. A malformed snapshot yields no price line rather than "USD undefined". */
function num(source: Record<string, unknown>, key: string): number | null {
  const v = source[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function money(currency: string | null, amount: number | null): string | null {
  if (amount === null) return null
  // Whole units: a nightly rate to the cent is noise at a glance, and the exact figure is the
  // booking site's to state at the moment of booking, not ours to freeze in a map popup.
  const rounded = Math.round(amount)
  // Grouping is locale-dependent too — a de-DE runtime writes "1.234", which next to a USD
  // symbol reads as one dollar twenty-three. Pinned for the same reason the dates above are.
  return currency ? `${currency} ${rounded.toLocaleString('en-US')}` : String(rounded)
}

/** An http(s) URL as written by the parser, or null for anything else (javascript:, junk). */
export function safeLink(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function appendLink(content: HTMLElement, url: string | null, label: string): void {
  const safe = safeLink(url)
  if (!safe) return
  const a = document.createElement('a')
  a.className = 'evidence-popup__source evidence-popup__source--secondary'
  a.href = safe
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = label
  content.append(a)
}

/** "Where to eat": what kind of food, where exactly, why Astrail chose it, and which stop it sits
 *  beside.
 *
 *  NO "matches your taste" row, though the field exists: `persist_restaurants` inserts
 *  `preference_match_json: {}` literally — "stays {} until prefs are wired (Step 9)" — so that
 *  block rendered for the fixture and never once in production. A section that is always empty on
 *  real data is worse than no section.
 *
 *  The street address IS real and was already being stored, unused, in `evidence_json.address`
 *  (Mapbox's `full_address`). On a map, where-exactly answers more than a website would.
 *
 *  `distance_m` is deliberately NOT rendered next to the anchor stop's name. It is measured from
 *  the DAY'S CENTROID — the point `suggest_restaurants` searched around — not from `near_place_id`.
 *  Printing "180 m from Nukata Station" would be a precise-sounding falsehood. */
export type EatFacts = {
  eyebrow: string
  title: string
  where: string | null
  summary: string | null
  near: string | null
  hours: string | null
  /** The details website, else the suggestion's source, and only when it is http(s). */
  link: string | null
}

/** The facts an eat card states, shared by this DOM card and the desktop React card. */
export function eatFacts(r: RestaurantSuggestion, place: Place, nearName?: string | null): EatFacts {
  const address = typeof r.evidence_json.address === 'string' ? r.evidence_json.address : null
  const details = eatDetails(r)
  return {
    eyebrow: ['Where to eat', r.cuisine].filter(Boolean).join(' · '),
    title: place.name,
    where: address || [place.area, place.city].filter(Boolean).join(', ') || null,
    summary: r.summary || null,
    near: nearName ? `Near ${nearName}` : null,
    hours: details.hours,
    link: safeLink(details.website ?? r.source_url),
  }
}

export function buildEatPopup(r: RestaurantSuggestion, place: Place, nearName?: string | null): HTMLElement {
  const f = eatFacts(r, place, nearName)
  const content = el('article', 'evidence-popup suggestion-popup')
  content.append(el('p', 'evidence-popup__eyebrow', f.eyebrow))
  content.append(el('h3', 'evidence-popup__title', f.title))
  if (f.where) content.append(el('p', 'evidence-popup__where', f.where))
  if (f.summary) content.append(el('p', 'suggestion-popup__body', f.summary))
  if (f.near) content.append(el('p', 'suggestion-popup__matches', f.near))
  if (f.hours) content.append(el('p', 'suggestion-popup__body', f.hours))
  appendLink(content, f.link, 'More about this place ↗')
  return content
}

/** Opening hours + website written by the details enrichment (see backend
 *  genagents/restaurant_details.py). Absent on every row generated before it existed, and absent
 *  whenever the search found nothing it could attribute — so both reads are guarded and neither
 *  is ever synthesised. */
function eatDetails(r: RestaurantSuggestion): { hours: string | null, website: string | null } {
  const d = r.evidence_json.details
  if (!d || typeof d !== 'object') return { hours: null, website: null }
  const rec = d as Record<string, unknown>
  return {
    hours: typeof rec.opening_hours === 'string' && rec.opening_hours.trim() ? rec.opening_hours : null,
    website: typeof rec.website === 'string' ? rec.website : null,
  }
}

/** "Where to stay": the numbers that actually decide a hotel — class, guest score, nightly rate,
 *  trip total, and how cancellable it was.
 *
 *  `now` is injectable because the cancellation deadline is a SNAPSHOT taken at `searched_at`, not
 *  a live quote: a trip reopened weeks later can hold a deadline that has already passed, and
 *  printing "Free cancellation until 16 July" in August states something untrue. Past deadlines
 *  degrade to a plainly-worded past-tense line instead. */
export type StayFacts = {
  eyebrow: string
  title: string
  area: string | null
  stars: string | null
  guest: string | null
  price: string | null
  cancellation: string | null
  note: string
}

/** The facts a stay card states, shared by this DOM card and the desktop React card. */
export function stayFacts(h: HotelSuggestion, now: number = Date.now()): StayFacts {
  const currency = typeof h.price_snapshot.currency === 'string' ? h.price_snapshot.currency : null
  const nightly = money(currency, num(h.price_snapshot, 'pricePerNight'))
  const total = money(currency, num(h.price_snapshot, 'totalPrice'))
  const price = [nightly && `${nightly} / night`, total && `${total} total`].filter(Boolean).join(' · ')
  return {
    eyebrow: ['Where to stay', h.is_recommended ? 'Recommended' : null].filter(Boolean).join(' · '),
    title: h.name,
    area: h.area || null,
    // Rounded to whole stars: a hotel class is 1–5, and "4.0" reads like a review score.
    stars: h.star_rating !== null ? `${'★'.repeat(Math.round(h.star_rating))} ${h.star_rating} star` : null,
    // Travala's guest score is 0–10 and is a DIFFERENT measure from the star class. Labelled so the
    // two never read as one number — "4 star · 9.4" alone invites reading 9.4 as nine stars.
    guest: h.guest_rating !== null ? `${h.guest_rating}/10 guest score` : null,
    price: price || null,
    cancellation: cancellationLine(h, now),
    // Search results, not an offer. Prices move and availability lapses, so the card says where
    // the number came from rather than implying we are holding it.
    note: 'Search result from Travala — prices change; Astrail does not book.',
  }
}

export function buildStayPopup(h: HotelSuggestion, now: number = Date.now()): HTMLElement {
  const f = stayFacts(h, now)
  const content = el('article', 'evidence-popup suggestion-popup')
  content.append(el('p', 'evidence-popup__eyebrow', f.eyebrow))
  content.append(el('h3', 'evidence-popup__title', f.title))
  if (f.area) content.append(el('p', 'evidence-popup__where', f.area))
  if (f.stars) content.append(el('p', 'suggestion-popup__stars', f.stars))
  if (f.guest) content.append(el('p', 'suggestion-popup__body', f.guest))
  if (f.price) content.append(el('p', 'suggestion-popup__body', f.price))
  if (f.cancellation) content.append(el('p', 'suggestion-popup__body', f.cancellation))
  content.append(el('p', 'suggestion-popup__note', f.note))
  return content
}

/** A live deadline is worth stating precisely; an expired one is only worth stating in the past
 *  tense. Neither is worth inventing, so an unknown refundability produces no line at all. */
function cancellationLine(h: HotelSuggestion, now: number): string | null {
  const until = h.free_cancellation_until ? Date.parse(h.free_cancellation_until) : NaN
  if (Number.isFinite(until) && until > now) {
    // Locale pinned like every other date in the app (one spelling of "Sep", not two). The zone
    // stays local on purpose: this is a real instant, not a date-only string, so the deadline is
    // most useful stated in the reader's own day. This path is browser-only — TripMap is
    // `dynamic(..., { ssr: false })` — so it cannot cause a hydration mismatch; it is pinned so
    // there is one rule here, not two.
    const when = new Date(until).toLocaleDateString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
    return `Free cancellation until ${when}`
  }
  if (h.refundable === true) return 'Was refundable when we searched — check current terms'
  if (h.refundable === false) return 'Non-refundable when we searched'
  return null
}
