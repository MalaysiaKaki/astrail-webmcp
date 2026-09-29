'use client'

import Link from 'next/link'

import { AstrailLogo } from '@/components/brand/AstrailLogo'
import { useScrolledPast } from './useScrolledPast'

/* Persistent chrome.

   The seat counter ("25 seats · open beta") is gone on THIS deployment: a scarcity signal reads
   as a funnel toward a beta, when the page's job is to show what the product does. The sign-in
   stays, because the tools act as the signed-in user — it just no longer sells anything.

   PHONES (< 768px) get their own header (Placify-pattern revamp, phase B1): the wordmark and the
   kit's primary sign-in, sitting flat on the hero at the top and turning into a floating white
   card once the page scrolls past 8px. Desktop gets the same behaviour with section links
   (phase B6), replacing the glass pills. */
export default function StoryNav() {
  return (
    <>
      <DesktopHeader />
      <PhoneHeader />
    </>
  )
}

const DESKTOP_LINKS = [
  { label: 'Story', href: '#story' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Agent', href: '#agent' },
  { label: 'FAQ', href: '#faq' },
] as const

/* DESKTOP (>= 768px, phase B6): Placify's site header. The wordmark left, the section links
   centred, the kit primary sign-in right; flat on the hero at the top, a floating white card once
   the page scrolls past 8px. Fixed, so the story sections scroll under it; only the inner bar
   changes (inset, fill, shadow), so floating never moves the page. The phone header below is
   untouched. */
function DesktopHeader() {
  const floating = useScrolledPast(8)

  return (
    <div className="story-desk-header m-desktop-only" data-floating={floating ? 'true' : 'false'}>
      <nav className="story-desk-header__bar" aria-label="Astrail">
        <Link href="/" aria-label="Astrail home" className="story-desk-header__home">
          <AstrailLogo variant="mark" tone="brass" height={24} />
          <span className="story-desk-header__name">Astrail</span>
        </Link>
        <ul className="story-desk-header__links">
          {DESKTOP_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="story-desk-header__link">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/sign-in" className="m-btn-primary story-desk-header__cta">
          Sign in to try it
        </Link>
      </nav>
    </div>
  )
}

/* The wrapper is sticky and a constant 72px tall, so floating never moves anything below it; only
   the inner bar changes (inset, fill, shadow). The wrapper ignores pointers so the transparent
   margin around the floating card never swallows a tap meant for the page. */
function PhoneHeader() {
  const floating = useScrolledPast(8)

  return (
    <div className="story-phone-header m-phone-only" data-floating={floating ? 'true' : 'false'}>
      <nav className="story-phone-header__bar" aria-label="Astrail">
        <Link href="/" aria-label="Astrail home" className="story-phone-header__home">
          {/* The lockup stacks the name under the glyph and is unreadable at header height, so
              phones set the mark beside the name in the display serif. */}
          <AstrailLogo variant="mark" tone="brass" height={22} />
          <span className="story-phone-header__name">Astrail</span>
        </Link>
        <Link href="/sign-in" className="m-btn-primary story-phone-header__cta">
          Sign in to try it
        </Link>
      </nav>
    </div>
  )
}
