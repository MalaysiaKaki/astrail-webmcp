import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import ChallengeBanner from '@/components/landing/ChallengeBanner'

/* Phase 4, landing on phones. The layout itself is CSS (story.css, one max-width:767.98px block)
   and is checked in a browser; these pin the markup the phone rules hang on. */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('landing on phones', () => {
  it('mounts the nav at the TOP of the story, so a phone can make it sticky in normal flow', () => {
    const stage = read('components/story/stage/StoryStage.tsx')
    const nav = stage.indexOf('<StoryNav />')
    const hero = stage.indexOf('className="story-hero')
    expect(nav).toBeGreaterThan(-1)
    expect(nav).toBeLessThan(hero)
  })

  it('gives the banner a one-line phone lead OUTSIDE the link, so the link never promises the agent', () => {
    render(<ChallengeBanner />)
    const status = screen.getByRole('status')
    const link = within(status).getByRole('link')
    const lead = status.querySelector('.challenge-banner__phone')!
    expect(lead).toHaveTextContent(/WebMCP Challenge build/)
    expect(link.contains(lead)).toBe(false)
    // The row-wide tap target hangs off the link itself (its ::after covers the row on phones).
    expect(link).toHaveClass('challenge-banner__link')
    expect(link).toHaveAccessibleName(/see a finished trip, no account needed/i)
  })

  it('keeps the full notice and fine print in the DOM for desktop and assistive tech', () => {
    render(<ChallengeBanner />)
    const status = screen.getByRole('status')
    expect(status.querySelector('.challenge-banner__lead')).toHaveTextContent(/WebMCP Challenge build of Astrail/)
    expect(status.querySelector('.challenge-banner__note')).toHaveTextContent(/free to open, in any browser/)
  })
})
