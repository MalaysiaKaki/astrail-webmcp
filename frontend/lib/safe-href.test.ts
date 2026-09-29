import { describe, expect, it } from 'vitest'

import { safeHref, safeHrefWithBase } from './safe-href'

describe('safeHref', () => {
  it('passes http and https URLs through unchanged', () => {
    expect(safeHref('https://instagram.com/reel/abc')).toBe('https://instagram.com/reel/abc')
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x')
  })

  it('rejects the javascript: scheme (the XSS vector)', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined()
  })

  it('rejects data: and other non-http schemes', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
  })

  it('returns undefined for empty/nullish input', () => {
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
  })

  it('allows a relative URL (resolves to https against the origin)', () => {
    expect(safeHref('/app/trip/123')).toBe('/app/trip/123')
  })
})

/* The ChatGPT widget runs in a sandboxed iframe whose origin is OPAQUE: location.origin is the
   string "null", and new URL(absolute, 'null') throws. Every cover and evidence link vanished. */
describe('safeHrefWithBase under an opaque origin', () => {
  const cover = 'https://ngfssihvukhxxqhcudix.supabase.co/storage/v1/object/public/reel-covers/abc.jpg'

  it('passes an absolute https URL when the origin is "null"', () => {
    expect(safeHrefWithBase(cover, 'null')).toBe(cover)
    expect(safeHrefWithBase('http://example.com/x', 'null')).toBe('http://example.com/x')
  })

  it('still rejects javascript: and data: under the opaque origin', () => {
    expect(safeHrefWithBase('javascript:alert(1)', 'null')).toBeUndefined()
    expect(safeHrefWithBase('data:text/html,<script>alert(1)</script>', 'null')).toBeUndefined()
  })

  it('resolves a relative URL against astrail.xyz when the origin is not a real http(s) origin', () => {
    expect(safeHrefWithBase('/app/trip/123', 'null')).toBe('/app/trip/123')
    expect(safeHrefWithBase('/app/trip/123', null)).toBe('/app/trip/123')
    expect(safeHrefWithBase('/app/trip/123', 'about:blank')).toBe('/app/trip/123')
  })

  it('behaves as before for a real page origin', () => {
    expect(safeHrefWithBase(cover, 'https://astrail.xyz')).toBe(cover)
    expect(safeHrefWithBase('javascript:alert(1)', 'https://astrail.xyz')).toBeUndefined()
  })
})
