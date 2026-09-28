import Link from 'next/link'

import PhoneOnlyPicture from './PhoneOnlyPicture'

/* Phone-only pieces of the hero (Placify-pattern revamp, phase B1). Both render inside the shared
   hero copy block and are hidden at >= 768px by the kit's m-phone-only; desktop keeps its own
   story-btn CTAs (m-desktop-only) and never sees any of this. FinalCTA reuses the actions. */

/* The encoded size of public/landing-mobile/trip-demo.* (a 390x844 DPR2 capture of
   /app/trip/demo, downscaled to 640 wide by the harness's capture-hero.mjs). Regenerating the
   capture at another width means updating these two numbers. */
const SHOT_WIDTH = 640
const SHOT_HEIGHT = 1385

export function PhoneHeroActions() {
  return (
    <div className="story-phone-ctas m-phone-only">
      <Link href="/sign-in" className="m-btn-primary">
        Sign in to try it
      </Link>
      <a href="#how-it-works" className="m-btn-secondary">
        See how it works
      </a>
    </div>
  )
}

export function PhoneHeroDevice() {
  return (
    <div className="story-phone-device m-phone-only">
      <figure className="story-phone-device__figure">
        <div className="story-phone-device__frame">
          <PhoneOnlyPicture
            base="/landing-mobile/trip-demo"
            width={SHOT_WIDTH}
            height={SHOT_HEIGHT}
            className="story-phone-device__shot"
            alt="Astrail's sample Tokyo trip on a phone: the route on the map above, and the first day's stops below, each quoting the Reel it came from."
            priority
          />
          <span className="story-phone-device__island" aria-hidden="true" />
          {/* Aster leans on the frame's bottom-left corner: he covers bezel and the rounded
              corner only, never the sheet's stops or any text. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- same still as Beat0Layer's */}
          <img
            className="story-phone-device__aster"
            src="/landing/aster-hero-mobile.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
        </div>
        <figcaption className="story-phone-device__caption">
          The sample trip, as it opens on a phone. Map &copy; Mapbox &copy; OpenStreetMap
        </figcaption>
      </figure>
    </div>
  )
}
