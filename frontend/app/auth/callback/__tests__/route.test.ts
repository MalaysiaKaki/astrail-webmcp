// The OAuth callback's `next`: previously appended to our origin raw, so next='@evil.com' built
// `${origin}@evil.com` — a URL whose host is evil.com. Only a same-site /app path may survive.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { exchangeCodeForSession } = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}))

import { NextRequest } from 'next/server'
import { GET } from '../route'

// Same jsdom/undici Headers mismatch middleware.test.ts documents: use the class Next builds with.
vi.stubGlobal('Headers', new NextRequest(new URL('https://astrail.app/')).headers.constructor)

const ORIGIN = 'https://astrail.app'
const TRIP = '/app/trip/3f1c9b2e-8d4a-4c7e-9b1a-2e6f0d5c4a7b'
const callback = (next: string | null) => {
  const url = new URL('/auth/callback', ORIGIN)
  url.searchParams.set('code', 'oauth-code')
  if (next !== null) url.searchParams.set('next', next)
  return GET(new Request(url))
}
const location = (res: Response) => res.headers.get('location')

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
})

describe('/auth/callback next', () => {
  it('keeps a trip path, so "Open in Astrail" lands on the trip', async () => {
    expect(location(await callback(TRIP))).toBe(`${ORIGIN}${TRIP}`)
    expect(location(await callback(`${TRIP}?x=1`))).toBe(`${ORIGIN}${TRIP}?x=1`)
  })

  it.each(['@evil.com', '//evil.com', 'https://evil.com', '/\\evil.com', '/%2F%2Fevil.com', '/app/../evil'])(
    'sends %s to our own /app instead', async (next) => {
      const to = location(await callback(next))
      expect(to).toBe(`${ORIGIN}/app`)
      expect(new URL(to!).host).toBe('astrail.app')
    },
  )

  it('defaults to /app without next, and still reports a failed exchange', async () => {
    expect(location(await callback(null))).toBe(`${ORIGIN}/app`)
    exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('bad code') })
    expect(location(await callback(TRIP))).toBe(`${ORIGIN}/sign-in?error=auth_failed`)
  })
})
