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
  ExternalLinkIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  TAB_ICON,
} from '@/components/dashboard/nav-icons'

/* Persistent paper sidebar for the /app document routes (dashboard, trails, settings).
   Connected full-bleed rail (see (shell)/layout.tsx): an identity block up top, a primary
   "New trail" action, icon-led nav, a live Recent-trails list that fills the rail, and a
   bottom account section (Feedback + Settings + Log out) over a divider. Desktop only (>=768):
   below that the phone tab bar (BottomTabBar) is the nav and Feedback/Log out live in Settings. Palette role tokens keep the parent .app-shell scope from
   bleeding in; the brand is the A-swoosh-star mark recoloured brass (AstrailLogo
   tone="brass") so it reads on the cream paper. */

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

const rowClass = (active: boolean) =>
  `group flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brass-deep)] ${
    active
      ? 'bg-[color:var(--surface-2)] font-medium text-[color:var(--text)]'
      : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]'
  }`

const recentRowClass = (active: boolean) =>
  `flex min-h-8 items-center rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brass-deep)] ${
    active
      ? 'bg-[color:var(--surface-2)] font-medium text-[color:var(--text)]'
      : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)]'
  }`

const iconClass = (active: boolean) =>
  `h-4 w-4 shrink-0 ${
    active
      ? 'text-[color:var(--text)]'
      : 'text-[color:var(--text-muted)] group-hover:text-[color:var(--text)]'
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

  return (
    <aside className="relative z-10 hidden h-full w-[256px] flex-none flex-col items-stretch border-r border-[color:var(--line-soft)] bg-[color:var(--surface-1)] p-3 md:flex">
      {/* Identity — the brand mark + signed-in account. Static header, not a switcher. */}
      <div className="mb-1 flex items-center gap-2.5 rounded-lg p-1">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] border border-[color:var(--line-soft)] bg-[color:var(--surface-2)]">
          <AstrailLogo variant="mark" tone="brass" height={20} />
        </span>
        <span className="min-w-0 truncate text-[11px] leading-tight text-[color:var(--text-muted)]">
          {email ?? 'Account'}
        </span>
      </div>

      {/* Primary action — start a new trail. */}
      <Link
        href="/app"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-[color:var(--accent)] bg-[color:var(--accent)] px-3 py-2.5 text-[13px] font-medium text-[color:var(--accent-text)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brass-deep)]"
      >
        <PlusIcon className="h-4 w-4" />
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

      {/* Recent trails — fills the rail. Grows to take the free space and
          scrolls past the limit. When empty it's just flex space, pushing account to the
          floor exactly as the old spacer did. */}
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        {recents.length > 0 ? (
          <>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--text-faint)]">
              Recent
            </p>
            <nav aria-label="Recent trails" className="min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-0.5">
                {recents.map((trip) => {
                  const active = pathname === `/app/trip/${trip.id}`
                  return (
                    <li key={trip.id}>
                      <Link
                        href={`/app/trip/${trip.id}`}
                        aria-current={active ? 'page' : undefined}
                        className={recentRowClass(active)}
                      >
                        <span className="truncate">{tripLabel(trip)}</span>
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
      <div className="flex flex-col gap-1 border-t border-[color:var(--line-soft)] pt-3">
        {/* Generations-left pill — advisory only (the atomic RPC is the enforcer). Hidden entirely when the read fails rather than showing a guess.
            Trial plans only: a beta seat has no quota to report, so the whole <p> drops rather
            than leaving an empty dashed box in the rail. */}
        {entitlement?.plan === 'trial' ? (
          <p
            className={`mb-1 rounded-lg border border-dashed border-[color:var(--line-soft)] bg-[color:var(--surface-0)] px-2.5 py-1.5 text-[11px] ${
              TRIAL_LIFETIME_LIMIT - entitlement.lifetimeTripCount <= 0
                ? 'text-[color:var(--brass-deep)]'
                : 'text-[color:var(--text-muted)]'
            }`}
          >
            {`Free trial · ${Math.max(0, TRIAL_LIFETIME_LIMIT - entitlement.lifetimeTripCount)} of ${TRIAL_LIFETIME_LIMIT} trip generation${TRIAL_LIFETIME_LIMIT === 1 ? '' : 's'} left`}
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
          <ExternalLinkIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-[color:var(--text-faint)]" />
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
    </aside>
  )
}
