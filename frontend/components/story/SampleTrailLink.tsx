import Link from 'next/link'

/**
 * The path a signed-out visitor can actually open. EXACT string, never a prefix or a suffix:
 * `middleware.ts` allowlists this literal, so a trailing slash or a query string is a different
 * string to that guard and bounces the visitor to /sign-in.
 */
const SAMPLE_TRAIL_PATH = '/app/trip/demo'

/* The one no-account way into the product, offered in the hero as the pill above the headline
   (Placify's announcement-pill slot), at every width since phase B6.

   The label promises only what any browser delivers, a finished trail on the map with its
   evidence. NOT the agent: WebMCP tools appear only in ChatGPT's built-in browser or Chrome 149+,
   and that requirement is stated once, in the agent section, which is the part about setup.

   prefetch is off: it is in the viewport from first paint, and the sample trail pulls
   the map workspace. Warming it on every landing visit costs every visitor more than it saves
   the ones who click. */
const LABEL = 'See a finished trip, no account needed'

export function SampleTrailPill() {
  return (
    <Link
      href={SAMPLE_TRAIL_PATH}
      prefetch={false}
      className="story-hero-pill m-pill-badge"
    >
      {/* A live-status dot, decoration with no words. */}
      <span aria-hidden="true" className="story-hero-pill__dot" />
      <span>{LABEL}</span>
      <svg
        aria-hidden="true"
        className="m-chevron"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </Link>
  )
}
