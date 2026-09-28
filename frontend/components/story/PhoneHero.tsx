import Link from 'next/link'

/* Phone-only pieces of the hero (Placify-pattern revamp, phase B1). Both render inside the shared
   hero copy block and are hidden at >= 768px by the kit's m-phone-only; desktop keeps its own
   story-btn CTAs (m-desktop-only) and never sees any of this. */

/* Matches the kit's phone query exactly, so the screenshot and the frame share one breakpoint. */
const PHONE_MEDIA = '(max-width: 767.98px)'

/* The encoded size of public/landing-mobile/trip-demo.* (a 390x844 DPR2 capture of
   /app/trip/demo, downscaled to 640 wide by the harness's capture-hero.mjs). Regenerating the
   capture at another width means updating these two numbers. */
const SHOT_WIDTH = 640
const SHOT_HEIGHT = 1385

/* A 1x1 transparent GIF. It is what the <img> resolves when no <source> matches, i.e. on desktop,
   so a desktop browser never requests the phone screenshot even though the markup is present. */
const NOTHING = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

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
          <picture>
            <source media={PHONE_MEDIA} type="image/avif" srcSet="/landing-mobile/trip-demo.avif" />
            <source media={PHONE_MEDIA} type="image/webp" srcSet="/landing-mobile/trip-demo.webp" />
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot express a
                media-gated <picture>; the phone-only fetch is the point of this markup. */}
            <img
              className="story-phone-device__shot"
              src={NOTHING}
              width={SHOT_WIDTH}
              height={SHOT_HEIGHT}
              alt="Astrail's sample Tokyo trip on a phone: the route on the map above, and the first day's stops below, each quoting the Reel it came from."
              decoding="async"
              fetchPriority="high"
            />
          </picture>
          <span className="story-phone-device__island" aria-hidden="true" />
        </div>
        <figcaption className="story-phone-device__caption">
          The sample trip, as it opens on a phone. Map &copy; Mapbox &copy; OpenStreetMap
        </figcaption>
      </figure>
      {/* Aster stands beside the frame, below the copy, so he can never sit on text. */}
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
  )
}
