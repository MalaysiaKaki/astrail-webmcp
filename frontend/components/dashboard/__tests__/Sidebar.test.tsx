/* The sample trail is the route a judge opens with no account — README and SUBMISSION both send
   people to /app/trip/demo — and until now nothing in the running app linked to it. It lives in
   the persistent rail rather than on a page, so it is reachable from every /app route. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Sidebar from '@/components/dashboard/Sidebar'
import type { Entitlement } from '@/lib/entitlement'

const path = { value: '/app' }
const trips: { value: Array<{ id: string; title: string }> } = { value: [] }
const { push, signOut } = vi.hoisted(() => ({ push: vi.fn(), signOut: vi.fn() }))
// null = the own-row read fails (the rail's fail-open path); otherwise the plan it resolves to.
const entitlement: { value: Entitlement | null } = { value: null }

vi.mock('next/navigation', () => ({
  usePathname: () => path.value,
  useRouter: () => ({ push }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'traveler@example.com' } } }), signOut },
  }),
}))
vi.mock('@/lib/trip/supabase-api', () => ({ listTrips: async () => trips.value }))
vi.mock('@/lib/entitlement', async (orig) => ({
  ...(await orig<typeof import('@/lib/entitlement')>()),
  readEntitlement: async () => {
    if (!entitlement.value) throw new Error('read failed')
    return entitlement.value
  },
}))

async function show(pathname: string) {
  path.value = pathname
  const view = render(<Sidebar />)
  // The rail fires three fetches on mount; settle them so no state lands outside act().
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument())
  // The entitlement read resolves a microtask later; drain it so an *absence* assertion below
  // is real rather than an artefact of asserting before the pill could have painted.
  await act(async () => {})
  return view
}

const current = (name: string) => screen.getByRole('link', { name }).getAttribute('aria-current')

beforeEach(() => {
  path.value = '/app'
  entitlement.value = null
  trips.value = []
  push.mockReset()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
})

// The plan pill, found by its role marker rather than by styling (C3 restyled it as a kit badge).
const planPill = (container: HTMLElement) => container.querySelector('[data-plan-pill]')

describe('Sidebar sample-trail link', () => {
  it('offers the sample trail from every /app route', async () => {
    await show('/app')
    expect(screen.getByRole('link', { name: 'Sample trail' })).toHaveAttribute(
      'href',
      '/app/trip/demo',
    )
  })

  it('marks itself current on /app/trip/demo', async () => {
    await show('/app/trip/demo')
    expect(current('Sample trail')).toBe('page')
  })

  it('does not light up Trails on the sample trail', async () => {
    /* /app/trip/demo is NOT under /app/trips, so the shared `startsWith` match must not claim it
       — two highlighted rows would tell the user they are somewhere they are not. */
    await show('/app/trip/demo')
    expect(current('Trails')).toBeNull()
    expect(current('Home')).toBeNull()
  })

  it('does not light up on the trails list', async () => {
    await show('/app/trips')
    expect(current('Sample trail')).toBeNull()
    expect(current('Trails')).toBe('page')
  })
})

/* Feedback used to open a Tally popup that stacked over pages and followed navigation; it now opens
   the form in its own browser tab. */
describe('Sidebar feedback link', () => {
  it('opens the Tally form in a new tab, with no popup hook left', async () => {
    await show('/app')
    const feedback = screen.getByRole('link', { name: /feedback/i })
    expect(feedback).toHaveAttribute('href', 'https://tally.so/r/PdNreP')
    expect(feedback).toHaveAttribute('target', '_blank')
    expect(feedback).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('[data-tally-open]')).toBeNull()
  })
})

/* The rail's plan pill. A beta account is every judge and every seat-holder, and telling them
   they are on a beta is noise — but the trial line is a real quota (TRIAL_LIFETIME_LIMIT is 1,
   so "0 of 1 left" is the only warning before generation is refused). Beta must therefore drop
   the whole <p>, not just its text: an empty dashed box in the rail is worse than the string. */
describe('Sidebar plan pill', () => {
  it('renders nothing at all for a beta account', async () => {
    entitlement.value = { plan: 'beta', lifetimeTripCount: 12, seatRequestedAt: null }
    const { container } = await show('/app')
    expect(screen.queryByText(/beta/i)).toBeNull()
    // ...and no empty badge left floating where the text used to be.
    expect(planPill(container)).toBeNull()
  })

  it('still shows a fresh trial its remaining generation', async () => {
    entitlement.value = { plan: 'trial', lifetimeTripCount: 0, seatRequestedAt: null }
    const { container } = await show('/app')
    expect(screen.getByText('Free trial · 1 of 1 trip generation left')).toBeInTheDocument()
    expect(planPill(container)).not.toBeNull()
  })

  it('still shows an exhausted trial its zero, in brass', async () => {
    entitlement.value = { plan: 'trial', lifetimeTripCount: 1, seatRequestedAt: null }
    await show('/app')
    const pill = screen.getByText('Free trial · 0 of 1 trip generation left')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toContain('text-[color:var(--brass-deep)]')
  })

  it('renders nothing when the entitlement read fails', async () => {
    entitlement.value = null
    const { container } = await show('/app')
    expect(planPill(container)).toBeNull()
    expect(screen.queryByText(/trial/i)).toBeNull()
  })
})

describe('Sidebar rail contents', () => {
  it('shows the signed-in email', async () => {
    await show('/app')
    expect(await screen.findByText('traveler@example.com')).toBeInTheDocument()
  })

  it('keeps New trail pointing at /app', async () => {
    await show('/app/settings')
    expect(screen.getByRole('link', { name: /new trail/i })).toHaveAttribute('href', '/app')
  })

  it('lists recent trails as links and marks the open one current', async () => {
    trips.value = [{ id: 't1', title: 'Kyoto in autumn' }, { id: 't2', title: 'Penang food run' }]
    await show('/app/trip/t2')
    const recent = await screen.findByRole('navigation', { name: 'Recent trails' })
    expect(recent).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kyoto in autumn' })).toHaveAttribute('href', '/app/trip/t1')
    expect(current('Kyoto in autumn')).toBeNull()
    expect(current('Penang food run')).toBe('page')
  })

  it('marks Settings current on /app/settings', async () => {
    await show('/app/settings')
    expect(current('Settings')).toBe('page')
    expect(current('Home')).toBeNull()
  })

  it('logs out and leaves for /sign-in', async () => {
    await show('/app')
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
