import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import StoryNav from '@/components/story/StoryNav'
import DesktopHeroShot, {
  DESKTOP_SHOT_HEIGHT,
  DESKTOP_SHOT_WIDTH,
} from '@/components/story/DesktopHeroShot'
import { DesktopHeroActions } from '@/components/story/PhoneHero'

vi.mock('@/components/story/PlayOnceVideo', () => ({ default: () => null }))

/* Phase B6 of the Placify-pattern revamp: the landing page at >= 768px. Layout is CSS
   (story-desktop.css, every rule under min-width: 768px) and is checked in a browser; these pin
   the markup and the loading contract the CSS and the image budget depend on. */

const DESKTOP = '(min-width: 768px)'
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

describe('desktop header', () => {
  const header = () => document.querySelector<HTMLElement>('.story-desk-header')!

  it('is a desktop-only nav with the wordmark, section links and the kit primary sign-in', () => {
    render(<StoryNav />)
    expect(header()).toHaveClass('m-desktop-only')
    expect(header().closest('.story-phone-header')).toBeNull()
    const nav = within(header()).getByRole('navigation', { name: 'Astrail' })
    expect(within(nav).getByRole('link', { name: 'Astrail home' })).toHaveAttribute('href', '/')
    for (const [name, href] of [
      ['Story', '#story'],
      ['How it works', '#how-it-works'],
      ['Agent', '#agent'],
      ['FAQ', '#faq'],
    ]) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    const signIn = within(nav).getByRole('link', { name: 'Sign in to try it' })
    expect(signIn).toHaveAttribute('href', '/sign-in')
    expect(signIn).toHaveClass('m-btn-primary')
  })

  it('is flat at the top and floats once the page scrolls past 8px', () => {
    render(<StoryNav />)
    expect(header()).toHaveAttribute('data-floating', 'false')
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(header()).toHaveAttribute('data-floating', 'true')
  })
})

describe('desktop hero', () => {
  it('offers sign-in as the kit primary and the walkthrough as the kit secondary', () => {
    render(<DesktopHeroActions />)
    const group = document.querySelector('.story-desk-ctas')!
    expect(group).toHaveClass('m-desktop-only')
    expect(within(group as HTMLElement).getByRole('link', { name: 'Sign in to try it' }))
      .toHaveClass('m-btn-primary')
    const how = within(group as HTMLElement).getByRole('link', { name: 'See how it works' })
    expect(how).toHaveClass('m-btn-secondary')
    expect(how).toHaveAttribute('href', '#how-it-works')
  })

  it('mounts the pill, the actions and the framed shot inside the hero, in that order', () => {
    const stage = read('components/story/stage/StoryStage.tsx')
    const at = (s: string) => stage.indexOf(s)
    const heroEnd = stage.indexOf('</section>', at('className="story-hero'))
    expect(at('<SampleTrailPill />')).toBeGreaterThan(-1)
    expect(at('<SampleTrailPill />')).toBeLessThan(at('<h1'))
    expect(at('<h1')).toBeLessThan(at('<DesktopHeroActions />'))
    expect(at('<DesktopHeroActions />')).toBeLessThan(at('<DesktopHeroShot />'))
    expect(at('<DesktopHeroShot />')).toBeLessThan(heroEnd)
  })

  it('no longer mounts the walk-in video layer, which neither width shows', () => {
    // Phones hid it in B1; the desktop hero is now the centred copy and the framed shot, so the
    // videos would only cost a download.
    expect(read('components/story/stage/StoryStage.tsx')).not.toMatch(/<Beat0Layer/)
  })
})

describe('desktop hero shot', () => {
  it('only lets a desktop fetch the screenshot', () => {
    render(<DesktopHeroShot />)
    const figure = screen.getByRole('figure')
    expect(figure.closest('.m-desktop-only')).not.toBeNull()

    const sources = figure.querySelectorAll('picture > source')
    expect([...sources].map((s) => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp'])
    for (const s of sources) expect(s).toHaveAttribute('media', DESKTOP)

    // The <img> fallback is what a phone resolves when no <source> matches: it must not point at
    // the desktop capture, or phones download it despite never showing it.
    const img = within(figure).getByRole('img', { name: /sample Tokyo trip/i })
    expect(img.getAttribute('src')).not.toMatch(/landing\/desktop/)
    expect(img).toHaveAttribute('width', String(DESKTOP_SHOT_WIDTH))
    expect(img).toHaveAttribute('height', String(DESKTOP_SHOT_HEIGHT))
  })

  it('credits the map data under the frame', () => {
    render(<DesktopHeroShot />)
    const caption = within(screen.getByRole('figure')).getByText(/Mapbox/)
    expect(caption).toHaveTextContent('© Mapbox')
    expect(caption).toHaveTextContent('© OpenStreetMap')
  })

  it.each(['trip-demo.avif', 'trip-demo.webp'])('keeps %s within the 250 KB budget, at its declared size', async (file) => {
    const path = join(process.cwd(), 'public/landing/desktop', file)
    const { size } = statSync(path)
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThanOrEqual(250 * 1024)
    const { default: sharp } = await import('sharp')
    const meta = await sharp(path).metadata()
    expect([meta.width, meta.height]).toEqual([DESKTOP_SHOT_WIDTH, DESKTOP_SHOT_HEIGHT])
  })
})

describe('desktop sections', () => {
  it('uses the kit buttons in the closing CTA on desktop', async () => {
    const { default: FinalCTA } = await import('@/components/story/sections/FinalCTA')
    render(<FinalCTA />)
    const desktop = document.querySelector('.story-cta .story-desk-ctas')!
    expect(desktop).toHaveClass('m-desktop-only')
    expect(within(desktop as HTMLElement).getByRole('link', { name: 'Sign in to try it' }))
      .toHaveClass('m-btn-primary')
  })

  it('keeps every desktop stylesheet rule behind the 768px query, so phones are untouched', () => {
    const css = read('components/story/story-desktop.css')
      // Comments may mention anything.
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const top = css.replace(/@media \(min-width: (768|1024|1280)px\)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    expect(top.trim(), 'a rule outside a min-width media block').toBe('')
    expect(read('components/story/stage/StoryStage.tsx')).toMatch(/import '\.\.\/story-desktop\.css'/)
  })
})
