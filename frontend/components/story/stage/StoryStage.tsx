'use client'

import '../story.css'
import '../story-desktop.css'

import StoryNav from '../StoryNav'
import DesktopHeroShot from '../DesktopHeroShot'
import { DesktopHeroActions, PhoneHeroActions, PhoneHeroDevice } from '../PhoneHero'
import { SampleTrailPill } from '../SampleTrailLink'
import AsterStory from '../sections/AsterStory'
import HowItWorks from '../sections/HowItWorks'
import LiveMapDemo from '../sections/LiveMapDemo'
import DemoVideoSlot from '../sections/DemoVideoSlot'
import AgentSection from '../sections/AgentSection'
import FAQ from '../sections/FAQ'
import FinalCTA from '../sections/FinalCTA'
import StoryFooter from '../sections/StoryFooter'
import { useLenis } from './useLenis'

/* PRODUCT-FIRST HYBRID, repointed to the open beta (2026-08-03).

   Aster walks in and idles, a two-chapter story interlude says who he is and
   why Astrail exists (ZH, 2026-08-06), then the page scrolls into the real
   product: how it works (real screenshots), a live map,
   the demo video, the FAQ, the CTA, and a full footer.

   The beta/seat framing this comment used to describe is gone from the rendered page and should
   not be restored from here. The primary action is "Sign in to try it" — the tools act as the
   signed-in user — but signing in is not the ONLY way in: `/app/trip/demo` offers six of the
   seventeen tools with no account, and the hero links it (SampleTrailLink).

   NOTE for anyone writing copy in this file: `/` registers NO WebMCP tools. `GlobalTools` mounts
   in the /app layout only. Describing what the agent can do once you are in the app is fine;
   writing "open this page and the agent can…" is a false claim. */
export default function StoryStage() {
  useLenis()

  return (
    <main className="story">
      {/* First in <main>: on phones the nav is sticky in normal flow at the top of the page
          (story.css). Desktop positions it fixed, where DOM order does not move it. */}
      <StoryNav />
      {/* ---- HERO: the pill, the promise, two actions, then the real product in a frame with
           Aster leaning on it (a phone frame < 768px, a browser frame >= 768px). The walk-in
           video layer (Beat0Layer) is no longer mounted: phones hid it in B1, and the B6 desktop
           hero is centred copy over the framed product, where the clip had no place. ---- */}
      <section className="story-hero relative h-[100dvh] min-h-[640px] overflow-hidden bg-[color:var(--story-ivory)]">
        <div className="story-copy story-copy--center" style={{ zIndex: 40 }}>
          {/* The no-account way in, as the pill above the headline. */}
          <SampleTrailPill />
          <p className="story-eyebrow text-[color:var(--story-teal-ink)]">
            AI-native trip planning &middot; works with your agent
          </p>
          <h1 className="story-h text-[color:var(--ink-900)] [font-size:clamp(2.4rem,4.6vw,4rem)]">
            Turn the reels you saved into a route you&rsquo;ll{' '}
            <span className="text-[color:var(--story-teal-ink)]">actually take.</span>
          </h1>
          <p className="story-sub max-w-[29em] text-[color:var(--ink-600)]">
            Astrail turns scattered travel inspiration into a real itinerary on
            a map, where every stop says where it came from. It speaks WebMCP, so an
            agent can plan and edit the trip with you, on the page you are looking at.
          </p>
          {/* The same two kit actions: side by side on desktop, stacked full-width on phones. */}
          <DesktopHeroActions />
          <PhoneHeroActions />
          {/* Phones only: a framed screenshot of the real trip view, with Aster on its corner.
              Before the fine print, so the CTAs lead straight into the product (Placify's
              order); desktop renders nothing here. */}
          <PhoneHeroDevice />
          {/* Desktop only: the sample trip in a browser frame, Aster on its corner. */}
          <DesktopHeroShot />
          <p className="story-sub story-hero__fineprint mt-7 text-[15px] text-[color:var(--ink-600)]">
            The tools live in the app, not on this page, which is just the pitch.
            Open Astrail in ChatGPT&rsquo;s built-in browser and ask what you can do
            here. Fourteen tools answer once you are signed in, seventeen once a trip
            is open, and six on the sample trip linked above, which needs no
            account.
          </p>
        </div>

        <div className="story-scroll-hint" style={{ zIndex: 40 }}>
          <span>Scroll to begin</span>
          <span aria-hidden>&darr;</span>
        </div>
      </section>

      {/* ---- STORY INTERLUDE: who Aster is, why Astrail exists (the two
           locked keyframes: overwhelm → rescue-burst), then straight into
           the real product. ---- */}
      <AsterStory />

      {/* ---- TRUST SECTIONS: the real product carries the page ---- */}
      <HowItWorks />
      <LiveMapDemo />
      <DemoVideoSlot />
      {/* What the agent can do and how to try it: after the product has been shown, before
          the questions it raises. */}
      <AgentSection />
      <FAQ />
      <FinalCTA />
      <StoryFooter />

    </main>
  )
}
