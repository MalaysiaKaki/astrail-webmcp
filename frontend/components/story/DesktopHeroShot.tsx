import PhoneOnlyPicture, { DESKTOP_MEDIA } from './PhoneOnlyPicture'

/* Desktop-only piece of the hero (Placify-pattern revamp, phase B6): the sample trip in a browser
   frame drawn in CSS, with Aster leaning on its bottom-left corner the way he leans on the phone
   frame. Hidden below 768px by the kit's m-desktop-only, and gated by DESKTOP_MEDIA so a phone
   never fetches the capture.

   The encoded size of public/landing/desktop/trip-demo.* (a 1440x900 DPR2 capture of
   /app/trip/demo, downscaled to 1600 wide by the harness's `capture-hero.mjs --desktop`).
   Regenerating at another width means updating these two numbers; a test compares them with the
   real files. */
export const DESKTOP_SHOT_WIDTH = 1600
export const DESKTOP_SHOT_HEIGHT = 1000

export default function DesktopHeroShot() {
  return (
    <div className="story-desk-shot m-desktop-only">
      <figure className="story-desk-shot__figure">
        <div className="story-desk-shot__frame">
          <div className="story-desk-shot__chrome" aria-hidden="true">
            <span className="story-desk-shot__dots">
              <span />
              <span />
              <span />
            </span>
            <span className="story-desk-shot__url">astrail.app/app/trip/demo</span>
          </div>
          <PhoneOnlyPicture
            media={DESKTOP_MEDIA}
            base="/landing/desktop/trip-demo"
            width={DESKTOP_SHOT_WIDTH}
            height={DESKTOP_SHOT_HEIGHT}
            className="story-desk-shot__img"
            alt="Astrail's sample Tokyo trip on desktop: the day's stops in a panel on the left, each quoting the Reel it came from, and the route on the map beside it."
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- a decorative still, lazy */}
          <img
            className="story-desk-shot__aster"
            src="/landing/aster-hero-mobile.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
        </div>
        <figcaption className="story-desk-shot__caption t-label">
          The sample trip, as it opens on a laptop. Map &copy; Mapbox &copy; OpenStreetMap
        </figcaption>
      </figure>
    </div>
  )
}
