import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { SampleTrailPill } from '@/components/story/SampleTrailLink'

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

  it('gives phones the sample trail as a one-line hero pill whose name keeps "no account"', () => {
    render(<SampleTrailPill />)
    const link = screen.getByRole('link')
    // The whole pill is the link: a kit pill badge, shown on phones only.
    expect(link).toHaveClass('m-pill-badge', 'm-phone-only', 'story-hero-pill')
    expect(link).toHaveAccessibleName(/^see a finished trip, no account needed/i)
    expect(within(link).getByText(/no account needed/i)).toBeInTheDocument()
  })
})
