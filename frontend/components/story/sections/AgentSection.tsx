/* What the agent can do, and how to try it. Two kit cards: the capabilities, and the setup steps.

   NOTE for anyone writing copy here: `/` registers NO WebMCP tools. `GlobalTools` mounts in the
   /app layout only, so this section describes what the agent can do in the app, never "on this
   page". The sample trip (linked from the hero) is the one place a signed-out visitor meets tools.

   No login is printed or read here, and none may be added: anything this page could print from a
   `NEXT_PUBLIC_*` var would also ship inside its public JavaScript (landing-contract.test.tsx). */

const CAPABILITIES = [
  <>
    <b>17 tools</b> registered with{' '}
    <code className="story-agent__code">document.modelContext.registerTool()</code>, 14 anywhere in
    the app and 3 more that appear only once a map exists to drive.
  </>,
  <>
    <code className="story-agent__code">get_app_state</code> answers &ldquo;what can I do
    here?&rdquo;, the fix for the one thing testers kept saying, that they could not tell where to
    click.
  </>,
  <>
    It can read your saved Reels, your trips, any day&apos;s itinerary, and why a given stop is on
    it: the verbatim caption where the stop came from a Reel, Astrail&apos;s own reasoning where it
    suggested one, and a plain &ldquo;you asked for this&rdquo; where you did.
  </>,
  <>
    It can also act: save Reels, start a generation that takes one to three minutes and narrate
    each stage, fly and tilt the live map, and move, remove, add or re-plan stops on a finished
    route.
  </>,
  <>
    Every stop that came from a Reel carries that Reel&apos;s own cover frame in its pin, and links
    back to the Reel itself rather than to a scraped directory page.
  </>,
  <>
    Planning a trip stops for approval on the page first, and so does every edit to a finished one,
    including the paid coordinate lookup behind a stop you asked for. Saving a Reel is the one
    action that spends without a card in front of it. It is bounded by a daily limit, and it skips a
    Reel whose places are already extracted.
  </>,
  <>
    Where a fact does not exist, the space stays empty. No invented opening hours, no borrowed
    photographs, and no Reel cited for a stop that did not come from one.
  </>,
]

const SETUP_STEPS = [
  <>Open Astrail in the ChatGPT desktop app&apos;s built-in browser, not Safari or Chrome.</>,
  <>Use GPT-5.6 Sol or Terra. Luna has WebMCP disabled.</>,
  <>
    Turn on <b>Settings &gt; Browser &gt; Permissions &gt; Enable site tools</b>.
  </>,
  <>
    Look for the Site tools arrow in the address bar and the WebMCP chip at the bottom-right of the
    page, then ask &ldquo;what can I do here?&rdquo;
  </>,
]

export default function AgentSection() {
  return (
    <section
      id="agent"
      aria-labelledby="agent-heading"
      className="story-agent bg-[color:var(--paper-1)] px-6 py-24 md:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <p className="story-eyebrow text-[color:var(--story-teal-ink)]">Works with an agent</p>
        <h2 id="agent-heading" className="story-h text-[color:var(--ink-900)]">
          What the agent can do
        </h2>
        <p className="story-sub max-w-[36em] text-[color:var(--ink-600)]">
          Astrail speaks WebMCP, so an agent in your browser can read the planner you are signed into
          and act on it, through the same controls your own clicks use.
        </p>

        <div className="story-agent__grid">
          <div className="story-agent__card m-card">
            <ul aria-label="Agent capabilities" className="story-agent__list t-body">
              {CAPABILITIES.map((item, i) => (
                <li key={i} className="story-agent__item">
                  <span aria-hidden="true" className="story-agent__dot" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <section
            aria-labelledby="agent-try-heading"
            className="story-agent__card story-agent__card--try m-card"
          >
            <h3 id="agent-try-heading" className="story-agent__title t-title">
              Try it with an agent
            </h3>
            <ol className="story-agent__steps t-body">
              {SETUP_STEPS.map((step, i) => (
                <li key={i} className="story-agent__step">
                  <span aria-hidden="true" className="story-agent__num t-label">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
            <p className="story-agent__note m-subcard t-meta">
              No account? The sample trip opens signed out, with six of the seventeen tools.
            </p>
          </section>
        </div>
      </div>
    </section>
  )
}
