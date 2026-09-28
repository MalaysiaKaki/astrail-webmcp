'use client'

import Link from 'next/link'

import { AstrailLogo } from '@/components/brand/AstrailLogo'
import { useScrolledPast } from './useScrolledPast'

/* Persistent chrome. Glass pills so the same nav reads on both the warm ivory hero and the night
   sections.

   The seat counter ("25 seats · open beta") is gone on THIS deployment. It is a real scarcity
   signal for the product, and reading it on a challenge build invites exactly the wrong
   conclusion: that a judge is being funnelled toward a beta rather than shown an experiment. The
   sign-in stays, because judges have credentials and need somewhere to use them — it just no
   longer sells anything.

   PHONES (< 768px) get their own header instead (Placify-pattern revamp, phase B1): the wordmark
   and the kit's primary sign-in, sitting flat on the hero at the top and turning into a floating
   white card once the page scrolls past 8px. The desktop nav is hidden there by the kit's
   m-desktop-only and is otherwise untouched. */
export default function StoryNav() {
  return (
    <>
      <nav className="story-nav m-desktop-only" aria-label="Astrail">
        <div className="story-nav__pill">
          <Link href="/" aria-label="Astrail home" className="flex items-center">
            <AstrailLogo variant="lockup" tone="chrome" height={22} priority />
          </Link>
          <a href="#story" className="story-nav__link">
            Story
          </a>
          <a href="#how-it-works" className="story-nav__link">
            How it works
          </a>
          <a href="#faq" className="story-nav__link">
            FAQ
          </a>
        </div>

        <div className="story-nav__pill">
          <span className="story-nav__seats">
            <b>WebMCP</b> &middot; challenge build
          </span>
          <Link href="/sign-in" className="story-nav__cta">
            Sign in to try it
          </Link>
        </div>
      </nav>
      <PhoneHeader />
    </>
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
