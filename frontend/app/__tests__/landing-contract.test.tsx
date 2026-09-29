import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/story/stage/StoryStage', () => ({
  default: () => <main data-testid="story-stage" />,
}))

vi.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: '--font-fraunces' }),
  Figtree: () => ({ variable: '--font-figtree' }),
  IBM_Plex_Mono: () => ({ variable: '--font-ibm-plex-mono' }),
}))

vi.mock('next/script', () => ({ default: () => null }))

// The closing CTA's bookend clip drives framer-motion's useInView, which needs an
// IntersectionObserver jsdom does not have. The copy is what is under test, not the video.
vi.mock('@/components/story/PlayOnceVideo', () => ({ default: () => null }))

import LandingPage, { metadata as pageMetadata } from '../page'
import { metadata } from '../layout'
import AgentSection from '@/components/story/sections/AgentSection'
import { SampleTrailButton, SampleTrailPill } from '@/components/story/SampleTrailLink'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/* The copy the landing page used to carry for a competition entry. The product no longer enters
   it, so none of these words may reach a visitor, the page metadata, or the README. */
const RETIRED_FRAMING = /challenge|hackathon|judge|devpost/i

describe('landing contract', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_EMAIL', '')
    vi.stubEnv('NEXT_PUBLIC_DEMO_PASSWORD', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('describes the product, not a competition entry, in the page metadata', () => {
    expect(String(pageMetadata.title)).not.toMatch(RETIRED_FRAMING)
    expect(String(pageMetadata.description)).not.toMatch(RETIRED_FRAMING)
    // WebMCP is a feature of the product, so it stays named.
    expect(String(pageMetadata.description)).toMatch(/WebMCP/)
  })

  it('renders no notice above the story, only the story itself', () => {
    render(<LandingPage />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('story-stage')).toBeInTheDocument()
  })

  /* `NEXT_PUBLIC_*` is inlined into the client bundle at build time. If a demo login were ever
     read here, its value would be readable straight out of the shipped JavaScript whether or not a
     component printed it, so the READ is the exposure and the read is what this watches. The
     account behind such a login spends real Apify and OpenAI credit. */
  it('never reads a demo credential out of the client bundle', () => {
    for (const file of ['app/page.tsx', 'components/story/stage/StoryStage.tsx',
      'components/story/sections/AgentSection.tsx', 'components/story/SampleTrailLink.tsx']) {
      expect(read(file), `${file} reads a NEXT_PUBLIC demo credential`).not.toMatch(
        /process\.env\.NEXT_PUBLIC_DEMO_(EMAIL|PASSWORD)/,
      )
    }
  })

  it('prints nothing credential-shaped even when the vars are set', () => {
    // Set them anyway: if the reads ever come back, this fails on real-looking values rather than
    // passing because the test environment happened to be empty.
    vi.stubEnv('NEXT_PUBLIC_DEMO_EMAIL', 'demo@example.com')
    vi.stubEnv('NEXT_PUBLIC_DEMO_PASSWORD', 'demo-password')

    const { container } = render(<AgentSection />)
    const shown = container.textContent ?? ''
    expect(shown).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    expect(shown).not.toContain('demo-password')
    expect(container.querySelector('dl'), 'a labelled term/value pair appeared').toBeNull()
  })

  it('marks the whole deployment noindex and nofollow', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
  })
})

/*
 * The no-account route in. `/app/trip/demo` is the only /app path a signed-out visitor can open.
 * It moved from the retired sticky notice into the hero: a pill above the headline on phones and
 * a secondary action beside the sign-in on desktop.
 */
describe('the no-account sample trail, in the hero', () => {
  const HERO_NAME = /see a finished trip,? .*no account needed/i

  it('offers it on phones as a kit pill badge, and on desktop as a secondary action', () => {
    render(
      <>
        <SampleTrailPill />
        <SampleTrailButton />
      </>,
    )
    const [pill, button] = screen.getAllByRole('link', { name: HERO_NAME })
    expect(pill).toHaveClass('m-pill-badge', 'm-phone-only')
    expect(button).toHaveClass('story-btn', 'm-desktop-only')
  })

  it('points both at exactly the path middleware allowlists', () => {
    render(
      <>
        <SampleTrailPill />
        <SampleTrailButton />
      </>,
    )
    // EXACT match, never a prefix or a suffix: middleware.ts allowlists the literal string
    // '/app/trip/demo'. A suffix or a query string is a different string to that guard and would
    // bounce a signed-out visitor to /sign-in.
    for (const link of screen.getAllByRole('link', { name: HERO_NAME })) {
      expect(link).toHaveAttribute('href', '/app/trip/demo')
    }
  })

  it('uses the same literal middleware allowlists, character for character', () => {
    /* The DOM cannot see the one mutation most likely to happen here: next/link normalises a
       trailing slash away, so a source `'/app/trip/demo/'` still RENDERS as `/app/trip/demo`.
       Pin the literal itself against middleware's own literal, so moving either side reddens. */
    const linked = read('components/story/SampleTrailLink.tsx')
      .match(/const SAMPLE_TRAIL_PATH = '([^']*)'/)?.[1]
    const allowlisted = read('middleware.ts').match(/nextUrl\.pathname === '([^']*)'/)?.[1]

    expect(linked).toBe('/app/trip/demo')
    expect(allowlisted).toBe(linked)
  })

  it('never promises the agent in the link — the tools need a WebMCP-capable browser', () => {
    render(<SampleTrailPill />)
    // A visitor opening this in Safari gets the map and the evidence and NO tools. Promising an
    // agent and delivering a static page is worse than promising nothing.
    const name = screen.getByRole('link', { name: HERO_NAME }).textContent ?? ''
    expect(name).not.toMatch(/agent|webmcp|tool/i)
  })

  it('is mounted inside the hero section, above the fine print that points at it', () => {
    const stage = read('components/story/stage/StoryStage.tsx')
    const heroStart = stage.indexOf('className="story-hero')
    const heroEnd = stage.indexOf('</section>', heroStart)
    const fineprint = stage.indexOf('story-hero__fineprint')
    for (const tag of ['<SampleTrailPill />', '<SampleTrailButton />']) {
      const at = stage.indexOf(tag)
      expect(at, `${tag} is not rendered`).toBeGreaterThan(heroStart)
      expect(at, `${tag} left the hero`).toBeLessThan(heroEnd)
      expect(at, `${tag} sits below the fine print that says "above"`).toBeLessThan(fineprint)
    }
    expect(stage.slice(fineprint, heroEnd)).toMatch(/sample trip linked above/)
  })
})

describe('what the agent can do', () => {
  it('lists the seven capabilities with the claims a reader can check in one grep', () => {
    render(<AgentSection />)

    const section = screen.getByRole('region', { name: 'What the agent can do' })
    const list = within(section).getByRole('list', { name: 'Agent capabilities' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(7)
    expect(section).toHaveTextContent('17 tools')
    expect(section).toHaveTextContent('document.modelContext.registerTool()')
    expect(section).toHaveTextContent('get_app_state')
  })

  it('gives the setup steps for trying it with an agent', () => {
    render(<AgentSection />)

    const card = screen.getByRole('region', { name: 'Try it with an agent' })
    expect(within(card).getAllByRole('listitem')).toHaveLength(4)
    expect(card).toHaveTextContent("ChatGPT desktop app's built-in browser")
    expect(card).toHaveTextContent('GPT-5.6 Sol or Terra')
    expect(card).toHaveTextContent('Luna has WebMCP disabled')
    expect(card).toHaveTextContent('Settings > Browser > Permissions > Enable site tools')
    expect(card).toHaveTextContent('Site tools arrow')
    expect(card).toHaveTextContent('WebMCP chip')
    // The no-account path, for anyone without a login.
    expect(card).toHaveTextContent(/sample trip opens signed out, with six of the seventeen tools/i)
  })

  it('is mounted in the story after the demo video and before the FAQ', () => {
    const stage = read('components/story/stage/StoryStage.tsx')
    const video = stage.indexOf('<DemoVideoSlot />')
    const agent = stage.indexOf('<AgentSection />')
    const faq = stage.indexOf('<FAQ />')
    expect(agent, 'the story stopped rendering the agent section').toBeGreaterThan(video)
    expect(agent).toBeLessThan(faq)
  })
})

describe('the story deck does not promise tools on the page that registers none', () => {
  /* `/` registers ZERO WebMCP tools — `GlobalTools` mounts in the /app layout only
     (app/app/layout.tsx). The claim "open THIS page and the agent can…" is cheap to reintroduce,
     reads perfectly well, and is false. Rendered rather than grepped, because the sentence a
     visitor reads is the thing under test. */
  it('sends the reader to the app, not to the page they are standing on', async () => {
    const { default: FinalCTA } = await import('@/components/story/sections/FinalCTA')
    render(<FinalCTA />)

    const copy = screen.getByText(/built-in\s+browser/i).textContent ?? ''
    expect(copy).toMatch(/not this page/i)
    expect(copy).toMatch(/sample trail opens with no account/i)
  })
})

describe('no competition framing survives on the story surfaces', () => {
  it('renders none of the retired words in the sections that used to carry them', async () => {
    const { default: FinalCTA } = await import('@/components/story/sections/FinalCTA')
    const { default: FAQ } = await import('@/components/story/sections/FAQ')
    const { default: StoryFooter } = await import('@/components/story/sections/StoryFooter')
    const { default: StoryNav } = await import('@/components/story/StoryNav')

    const { container } = render(
      <>
        <StoryNav />
        <SampleTrailPill />
        <SampleTrailButton />
        <AgentSection />
        <FAQ />
        <FinalCTA />
        <StoryFooter />
      </>,
    )
    expect(container.textContent).not.toMatch(RETIRED_FRAMING)
  })

  it('keeps them out of the hero copy, which lives in StoryStage', () => {
    const stage = read('components/story/stage/StoryStage.tsx')
    expect(stage).not.toMatch(RETIRED_FRAMING)
  })
})
