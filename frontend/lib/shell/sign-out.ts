'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Log out from the rail or from Settings. supabase-js clears the local session even when the
 * server call fails, so an error is logged and we still leave for /sign-in: staying on an /app page
 * with no session would only strand the user on failing reads.
 */
export function useSignOut(): () => Promise<void> {
  const router = useRouter()
  return useCallback(async () => {
    try {
      const { error } = await createClient().auth.signOut()
      if (error) console.error('[sign-out] Supabase reported an error', error)
    } catch (e) {
      console.error('[sign-out] Supabase sign-out threw', e)
    }
    router.push('/sign-in')
  }, [router])
}
