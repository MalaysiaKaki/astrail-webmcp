import { statSync } from 'node:fs'
import { join } from 'node:path'

import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import StoryNav from '@/components/story/StoryNav'
import { PhoneHeroActions, PhoneHeroDevice } from '@/components/story/PhoneHero'
import { SampleTrailPill } from '@/components/story/SampleTrailLink'

/* Phase B1 of the Placify-pattern revamp, home page on phones (< 768px). Visibility is CSS
   (the kit's m-phone-only / m-desktop-only, story.css), checked in a browser; these pin the markup
   and the loading contract the CSS and the budget depend on. */

const PHONE = '(max-width: 767.98px)'

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

describe('phone header', () => {
  const phoneHeader = () =>
    document.querySelector<HTMLElement>('.story-phone-header')!

  it('is a separate phone-only nav with the wordmark and the kit primary sign-in', () => {
    render(<StoryNav />)
    const header = phoneHeader()
    expect(header).toHaveClass('m-phone-only')
    const nav = within(header).getByRole('navigation', { name: 'Astrail' })
    expect(within(nav).getByRole('link', { name: 'Astrail home' })).toHaveAttribute('href', '/')
    const signIn = within(nav).getByRole('link', { name: 'Sign in to try it' })
    expect(signIn).toHaveAttribute('href', '/sign-in')
    expect(signIn).toHaveClass('m-btn-primary')
  })

  it('leaves the desktop nav as it was, hidden only below 768px', () => {
    render(<StoryNav />)
    const desktop = document.querySelector('nav.story-nav')!
    expect(desktop).toHaveClass('m-desktop-only')
    expect(desktop.closest('.story-phone-header')).toBeNull()
  })

  it('is flat at the top and floats once the page scrolls past 8px', () => {
    render(<StoryNav />)
    expect(phoneHeader()).toHaveAttribute('data-floating', 'false')
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(phoneHeader()).toHaveAttribute('data-floating', 'true')
  })
})

describe('phone hero actions', () => {
  it('offers sign-in as the kit primary and the walkthrough as the kit secondary', () => {
    render(<PhoneHeroActions />)
    const group = document.querySelector('.story-phone-ctas')!
    expect(group).toHaveClass('m-phone-only')
    expect(within(group as HTMLElement).getByRole('link', { name: 'Sign in to try it' }))
      .toHaveClass('m-btn-primary')
    const how = within(group as HTMLElement).getByRole('link', { name: 'See how it works' })
    expect(how).toHaveClass('m-btn-secondary')
    expect(how).toHaveAttribute('href', '#how-it-works')
  })
})

describe('phone hero device frame', () => {
  it('only lets a phone fetch the screenshot', () => {
    render(<PhoneHeroDevice />)
    const figure = screen.getByRole('figure')
    expect(figure.closest('.m-phone-only')).not.toBeNull()

    const sources = figure.querySelectorAll('picture > source')
    expect(sources).toHaveLength(2)
    expect([...sources].map((s) => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp'])
    for (const s of sources) expect(s).toHaveAttribute('media', PHONE)

    // The <img> fallback is what a desktop resolves when no <source> media matches: it must not
    // point at the phone image, or desktop downloads it despite never showing it.
    const img = within(figure).getByRole('img')
    expect(img.getAttribute('src')).not.toMatch(/landing-mobile/)
    expect(img).toHaveAttribute('width', '640')
    expect(img).toHaveAttribute('height', '1385')
    expect(img.getAttribute('alt')).toMatch(/Tokyo/)
  })

  it('credits the map data under the frame', () => {
    render(<PhoneHeroDevice />)
    const caption = within(screen.getByRole('figure')).getByText(/Mapbox/)
    expect(caption).toHaveTextContent('© Mapbox')
    expect(caption).toHaveTextContent('© OpenStreetMap')
  })

  it.each(['trip-demo.avif', 'trip-demo.webp'])('keeps %s within the 150 KB budget', (file) => {
    const { size } = statSync(join(process.cwd(), 'public/landing-mobile', file))
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThanOrEqual(150 * 1024)
  })
})

describe('sample trail as the phone hero pill', () => {
  it('adds only decoration to the pill: a status dot and a chevron, both hidden', () => {
    render(<SampleTrailPill />)
    const link = screen.getByRole('link')

    expect(link.querySelector('.story-hero-pill__dot')).toHaveAttribute('aria-hidden', 'true')
    expect(link.querySelector('svg.m-chevron')).toHaveAttribute('aria-hidden', 'true')
    // Decoration adds no words: the name still promises exactly the finished trip.
    expect(link).toHaveAccessibleName(/^see a finished trip, no account needed$/i)
  })
})
