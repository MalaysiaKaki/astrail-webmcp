'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AstrailLogo } from '@/components/brand/AstrailLogo'
import { readEntitlement, TRIAL_LIFETIME_LIMIT } from '@/lib/entitlement'
import type { Entitlement } from '@/lib/entitlement'
import { listTrips } from '@/lib/trip/supabase-api'
import type { Trip } from '@/lib/trip/backend-types'
import { TALLY_FEEDBACK_URL } from '@/lib/tally'
import { isNavActive, SHELL_TABS } from '@/lib/shell/nav'
import type { ShellTabId } from '@/lib/shell/nav'
import { useSignOut } from '@/lib/shell/sign-out'
import {
  ChatIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  TAB_ICON,
} from '@/components/dashboard/nav-icons'

/* Persistent sidebar for the /app document routes (dashboard, trails, settings), desktop only
   (>=768; below that the phone tab bar is the nav and Feedback/Log out live in Settings).
   Placify styling (web revamp C3): the 256px column is page paper, and inside it floats one
   frosted card panel (.ui-floating-panel) holding an identity block, the "New trail" kit button,
   pill nav rows whose current row sits on a white lens (the phone tab bar's active state), a live
   Recent list grouped in a white card with chevrons, and an account section (plan badge, Feedback
   in a new tab, Settings, Log out). The column width is unchanged, so main does not move.

   Kit classes are unlayered CSS and beat Tailwind utilities, so rows here are built from the kit
   tokens (--m-*, --t-*) rather than by overriding .m-card-link. Focus rings inside the scrolling
   Recent card are inset: an outer ring would be clipped by the scroller. */

/* The rail shows the same destinations as the phone tabs (lib/shell/nav) minus Settings, which
   sits in the account section. "Sample trail" reads as an example rather than one of the user's
   own: the Recent list below it holds their real trails. */
const RAIL_LABEL: Partial<Record<ShellTabId, string>> = { sample: 'Sample trail' }
const RAIL_NAV = SHELL_TABS.filter((tab) => tab.id !== 'settings')

const RECENTS_LIMIT = 8

// Best available human label for a trip row — narrator title first, then whatever
// destination we inferred/were told, then a neutral fallback so a row never renders blank.
function tripLabel(trip: Trip): string {
  return trip.title || trip.inferred_destination || trip.destination_hint || 'Untitled trail'
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]'
const PRESS = 'transition-[transform,background-color,box-shadow] duration-[var(--m-dur-press)] ease-[var(--m-ease)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100'

/* A pill row: 44px, icon + label; the current row is lifted onto a white lens in bold ink. */
const rowClass = (active: boolean) =>
  `group flex min-h-11 w-full items-center gap-3 rounded-[var(--m-r-pill)] px-3.5 text-left font-[family-name:var(--font-ui)] text-[length:var(--t-body)] ${PRESS} ${FOCUS_RING} ${
    active
      ? 'bg-[color:var(--m-card)] font-bold text-[color:var(--m-ink)] shadow-[var(--m-shadow-1)]'
      : 'font-medium text-[color:var(--m-text-muted)] hover:bg-[color:var(--m-accent-wash)] hover:text-[color:var(--m-text)]'
  }`

/* A row of the grouped Recent card: compact (44px), hairline-separated, trailing chevron. */
const recentRowClass = (active: boolean) =>
  `flex min-h-11 items-center gap-2 px-3.5 font-[family-name:var(--font-ui)] text-[length:var(--t-meta)] transition-colors duration-[var(--m-dur-press)] motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)] ${
    active
      ? 'bg-[color:var(--m-accent-wash)] font-semibold text-[color:var(--m-ink)]'
      : 'text-[color:var(--m-text)] hover:bg-[color:var(--m-subcard)]'
  }`

const iconClass = (active: boolean) =>
  `h-5 w-5 shrink-0 ${
    active
      ? 'text-[color:var(--m-ink)]'
      : 'text-[color:var(--m-text-muted)] group-hover:text-[color:var(--m-text)]'
  }`

export default function Sidebar() {
  const pathname = usePathname()
  const signOut = useSignOut()
  const [email, setEmail] = useState<string | null>(null)
  const [recents, setRecents] = useState<Trip[]>([])
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)

  useEffect(() => {
    let active = true
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setEmail(data.user?.email ?? null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Recent trails fill the rail (Claude's "Recents" move). Non-critical: on any failure we
  // simply render no list — the rail falls back to empty flex space, never an error.
  useEffect(() => {
    let active = true
    listTrips()
      .then((trips) => {
        if (active) setRecents(trips.slice(0, RECENTS_LIMIT))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Advisory generations-left indicator (same own-row read the flows use). Non-critical:
  // on any failure we render no pill — never an error, and never a blocked action.
  useEffect(() => {
    let active = true
    readEntitlement()
      .then((ent) => {
        if (active) setEntitlement(ent)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const settingsActive = isNavActive(pathname, '/app/settings')

  const trialLeft = entitlement?.plan === 'trial' ? Math.max(0, TRIAL_LIFETIME_LIMIT - entitlement.lifetimeTripCount) : null

  // overflow-hidden: the panel's shadow must not spill past x=256 into main, which stays
  // pixel-identical; the 12px right margin lets the shadow fade out before that cut. z-10 keeps
  // the opaque column above the shared fixed map that /app/trips shows through main.
  return (
    <aside className="relative z-10 hidden h-full w-[256px] flex-none overflow-hidden bg-[color:var(--surface-0)] py-4 pl-4 pr-3 md:flex">
      <div className="ui-floating-panel flex min-h-0 w-full">
        {/* The panel class clips (overflow: hidden, unlayered), so the scroller is this inner box:
            on a short viewport (844x390 landscape) the account rows scroll into reach instead of
            being cut off. The 12px padding leaves room for the rows' outer focus ring. */}
        <div className="flex min-h-0 w-full flex-col overflow-y-auto p-3">
          {/* Identity — the brand mark + signed-in account. Static header, not a switcher. */}
          <div className="flex items-center gap-3 px-1 pt-1">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[color:var(--m-card)] shadow-[var(--m-shadow-1)]">
              <AstrailLogo variant="mark" tone="brass" height={18} />
            </span>
            <span className="t-meta min-w-0 truncate">{email ?? 'Account'}</span>
          </div>

          {/* Primary action — start a new trail. */}
          <Link href="/app" className="m-btn-primary mt-4 w-full">
            <PlusIcon className="h-[18px] w-[18px]" />
            New trail
          </Link>

          {/* Main nav */}
          <nav aria-label="Main" className="mt-4 flex flex-col gap-1">
            {RAIL_NAV.map(({ id, href, label }) => {
              const active = isNavActive(pathname, href)
              const Icon = TAB_ICON[id]
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={rowClass(active)}
                >
                  <Icon className={iconClass(active)} />
                  <span className="truncate">{RAIL_LABEL[id] ?? label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Recent trails — fills the rail. Grows to take the free space and scrolls past the
              limit. When empty it's just flex space, pushing account to the floor. With trails it
              never shrinks below the label + two rows (24 + 88px): the floor sits on this flex
              child, not the card, or the card would overflow it onto the account rows. On a short
              viewport the panel body scrolls instead. */}
          <div className={`mt-5 flex flex-1 flex-col ${recents.length > 0 ? 'min-h-[112px]' : 'min-h-0'}`}>
            {recents.length > 0 ? (
              <>
                <p className="t-label px-3.5 pb-2 uppercase text-[color:var(--m-text-muted)]">Recent</p>
                <nav
                  aria-label="Recent trails"
                  className="min-h-0 overflow-y-auto rounded-[var(--m-r-sub)] bg-[color:var(--m-card)] shadow-[var(--m-shadow-1)]"
                >
                  <ul className="flex flex-col divide-y divide-[color:var(--line-soft)]">
                    {recents.map((trip) => {
                      const active = pathname === `/app/trip/${trip.id}`
                      return (
                        <li key={trip.id}>
                          <Link
                            href={`/app/trip/${trip.id}`}
                            aria-current={active ? 'page' : undefined}
                            className={recentRowClass(active)}
                          >
                            <span className="min-w-0 truncate">{tripLabel(trip)}</span>
                            <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-[color:var(--m-text-muted)]" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
              </>
            ) : null}
          </div>

          {/* Account section */}
          <div className="mt-3 flex flex-col gap-1 border-t border-[color:var(--line-soft)] pt-3">
            {/* Generations-left badge — advisory only (the atomic RPC is the enforcer). Hidden
                entirely when the read fails rather than showing a guess. Trial plans only: a beta
                seat has no quota to report, so the whole badge drops rather than leaving an empty
                one in the rail. It wraps to two lines at 256px, so it takes the kit's sub-card
                radius instead of the full pill (inline: the kit class is unlayered). The text colour
                sits on the inner span because the kit class sets the badge's own colour. */}
            {trialLeft !== null ? (
              <p
                data-plan-pill
                className="m-pill-badge mb-2 py-2"
                style={{ borderRadius: 'var(--m-r-sub)' }}
              >
                <span
                  className={`t-label ${
                    trialLeft <= 0 ? 'text-[color:var(--brass-deep)]' : 'text-[color:var(--m-text-muted)]'
                  }`}
                >
                  {`Free trial · ${trialLeft} of ${TRIAL_LIFETIME_LIMIT} trip generation${TRIAL_LIFETIME_LIMIT === 1 ? '' : 's'} left`}
                </span>
              </p>
            ) : null}
            {/* Beta feedback — the Tally form (PdNreP) in its own browser tab. Distinct from the
                per-trip thumbs feedback; this is the "tell us anything" channel. */}
            <a
              href={TALLY_FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={rowClass(false)}
            >
              <ChatIcon className={iconClass(false)} />
              <span className="truncate">Feedback</span>
              <ExternalLinkIcon className="ml-auto h-4 w-4 shrink-0 text-[color:var(--m-text-muted)]" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Link
              href="/app/settings"
              aria-current={settingsActive ? 'page' : undefined}
              className={rowClass(settingsActive)}
            >
              <SettingsIcon className={iconClass(settingsActive)} />
              <span className="truncate">Settings</span>
            </Link>
            <button type="button" onClick={() => void signOut()} className={rowClass(false)}>
              <LogOutIcon className={iconClass(false)} />
              <span className="truncate">Log out</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
