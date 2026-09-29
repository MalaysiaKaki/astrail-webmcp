import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { safeReturnPath } from '@/lib/auth/safe-return-path'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Never trust `next`: appended to our origin raw, '@evil.com' made `${origin}@evil.com` — a URL
  // whose HOST is evil.com (the origin became userinfo). Only a same-site /app path survives.
  const next = safeReturnPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
}
