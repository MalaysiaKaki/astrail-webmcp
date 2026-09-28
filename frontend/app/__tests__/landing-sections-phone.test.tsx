import { statSync } from 'node:fs'
import { join } from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import FAQ from '@/components/story/sections/FAQ'
import HowItWorks from '@/components/story/sections/HowItWorks'
import StoryFooter from '@/components/story/sections/StoryFooter'
import { contactEmail, faqs } from '@/components/landing/landing-copy'

// FinalCTA's bookend clip needs IntersectionObserver; the markup is what is under test.
vi.mock('@/components/story/PlayOnceVideo', () => ({ default: () => null }))

/* Phase B2 of the Placify-pattern revamp: the story sections on phones (< 768px). Layout is CSS
   (story.css) and checked in a browser; these pin the markup the phone rules and the kit use,
   the disclosure behaviour, the phone-only image contract, and that no link target moved. */

const PHONE = '(max-width: 767.98px)'

describe('FAQ on phones: card-link disclosures', () => {
  const toggles = () =>
    screen.getAllByRole('button').filter((b) => b.classList.contains('story-faq__toggle'))

  it('gives every question a phone-only kit card-link toggle, collapsed at first', () => {
    render(<FAQ />)
    const buttons = toggles()
    expect(buttons).toHaveLength(faqs.length)
    buttons.forEach((b, i) => {
      expect(b).toHaveClass('m-card-link', 'm-phone-only')
      expect(b).toHaveAccessibleName(faqs[i].question)
      expect(b).toHaveAttribute('aria-expanded', 'false')
      const answer = document.getElementById(b.getAttribute('aria-controls')!)
      expect(answer?.tagName).toBe('DD')
      expect(answer).toHaveTextContent(faqs[i].answer)
    })
  })

  it('keeps every answer in the DOM, so desktop still shows the static list', () => {
    render(<FAQ />)
    for (const f of faqs) expect(screen.getByText(f.answer)).toBeInTheDocument()
    // Desktop reads the plain question, hidden on phones by the kit.
    const desktopQ = screen.getByText(faqs[0].question, { selector: '.m-desktop-only' })
    expect(desktopQ.closest('dt')).not.toBeNull()
  })

  it('opens and closes each item on its own', () => {
    render(<FAQ />)
    const [first, second] = toggles()
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(first.closest('.story-faq__item')).toHaveAttribute('data-open', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(first.closest('.story-faq__item')).toHaveAttribute('data-open', 'false')
  })
})

describe('How it works on phones: step cards with phone-only crops', () => {
  const crops = () => [...document.querySelectorAll('.story-shot__phone picture')]

  it('gives each step a phone crop that only a phone fetches, lazily', () => {
    render(<HowItWorks />)
    expect(crops()).toHaveLength(3)
    for (const picture of crops()) {
      expect(picture.closest('.m-phone-only')).not.toBeNull()
      for (const s of picture.querySelectorAll('source')) expect(s).toHaveAttribute('media', PHONE)
      const img = picture.querySelector('img')!
      expect(img.getAttribute('src')).not.toMatch(/landing-mobile/)
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img.getAttribute('alt')).toBeTruthy()
    }
  })

  it('declares the real pixel size of each crop and keeps it within 150 KB', async () => {
    render(<HowItWorks />)
    for (const picture of crops()) {
      const base = picture.querySelector('source')!.getAttribute('srcset')!.replace(/\.avif$/, '')
      const img = picture.querySelector('img')!
      for (const ext of ['avif', 'webp']) {
        const file = join(process.cwd(), 'public', `${base}.${ext}`)
        expect(statSync(file).size).toBeLessThanOrEqual(150 * 1024)
        const meta = await sharp(file).metadata()
        expect(String(meta.width)).toBe(img.getAttribute('width'))
        expect(String(meta.height)).toBe(img.getAttribute('height'))
      }
    }
  })

  it('credits the map wherever a crop carries a credit line', () => {
    render(<HowItWorks />)
    for (const c of document.querySelectorAll('.story-shot__credit')) {
      expect(c).toHaveTextContent('© Mapbox © OpenStreetMap')
    }
  })

  it('shows step 3 as a real phone capture of the sample trail, described as such', () => {
    render(<HowItWorks />)
    const last = crops().at(-1)!
    expect(last.querySelector('source')).toHaveAttribute('srcset', '/landing-mobile/step-trip-sheet.avif')
    expect(last.querySelector('img')!.getAttribute('alt')).toMatch(/sample trip on a phone/i)
  })

  it('keeps the desktop browser-frame screenshot untouched', () => {
    render(<HowItWorks />)
    const desktopShots = document.querySelectorAll('figure img[src^="/landing/screens/"]')
    expect(desktopShots).toHaveLength(3)
  })
})

describe('closing CTA on phones', () => {
  it('uses the kit pills on phones and keeps the story buttons for desktop', async () => {
    const { default: FinalCTA } = await import('@/components/story/sections/FinalCTA')
    render(<FinalCTA />)
    const phone = document.querySelector('.story-cta .story-phone-ctas')!
    expect(phone).toHaveClass('m-phone-only')
    expect(within(phone as HTMLElement).getByRole('link', { name: 'Sign in to try it' }))
      .toHaveClass('m-btn-primary')
    const desktop = document.querySelector('.story-cta .story-btn--primary')!.parentElement!
    expect(desktop).toHaveClass('m-desktop-only')
  })
})

describe('footer on phones', () => {
  it('keeps every link target', () => {
    render(<StoryFooter />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '#how-it-works',
      '#faq',
      '/sign-in',
      `mailto:${contactEmail}`,
      `mailto:${contactEmail}?subject=Astrail%20beta%20feedback`,
      'https://www.instagram.com/astrail.xyz/',
      'https://x.com/astrailxyz',
      'https://x.com/haotobuildzip',
      '/privacy',
      '/terms',
    ])
  })
})
