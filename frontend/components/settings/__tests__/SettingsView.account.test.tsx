/* Feedback and Log out live in Settings now (they left the phone nav), so they must work
   whatever the profile/preferences reads are doing: still pending, or failed outright. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEMO_MEMORY_FACTS, DEMO_PROFILE } from '@/lib/trip/fixtures'

const { getProfile, getMemoryPreferences, push, signOut } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getMemoryPreferences: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/trip/supabase-api', () => ({ getProfile, getMemoryPreferences }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))

import SettingsView from '@/components/settings/SettingsView'

function expectAccountRows() {
  const feedback = screen.getByRole('link', { name: /feedback/i })
  expect(feedback).toHaveAttribute('href', 'https://tally.so/r/PdNreP')
  expect(feedback).toHaveAttribute('target', '_blank')
  expect(feedback.getAttribute('rel')).toContain('noopener')
  expect(feedback).not.toHaveAttribute('data-tally-open')
  expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
}

beforeEach(() => {
  push.mockReset()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  getProfile.mockResolvedValue({ profile: DEMO_PROFILE, facts: [] })
  getMemoryPreferences.mockResolvedValue({ status: 'ok', facts: DEMO_MEMORY_FACTS })
})

describe('SettingsView account rows', () => {
  it('are usable while the profile read is still pending', () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    render(<SettingsView />)
    expect(screen.getByText(/loading your settings/i)).toBeInTheDocument()
    expectAccountRows()
  })

  it('are usable when the profile read fails, which now says so instead of loading forever', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    getProfile.mockRejectedValue(new Error('rls denied'))
    render(<SettingsView />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load your settings/i)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
    expect(screen.queryByText(/loading your settings/i)).not.toBeInTheDocument()
    expectAccountRows()
  })

  it('are present alongside loaded settings', async () => {
    render(<SettingsView />)
    await screen.findByText(/using your saved travel preferences/i)
    expectAccountRows()
  })

  it('log out signs out and then sends you to /sign-in', async () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0])
  })

  it('log out still leaves when Supabase reports an error (the local session is cleared regardless)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    signOut.mockResolvedValue({ error: new Error('network') })
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'))
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
