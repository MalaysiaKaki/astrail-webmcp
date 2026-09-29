/**
 * Return `url` only when it is an http(s) URL; otherwise `undefined`.
 *
 * Defense-in-depth for `<a href>` sinks fed by backend-supplied URLs (evidence source_url, reel
 * normalized_url, etc.). React does NOT sanitize the `javascript:` scheme in an href, so a
 * `javascript:`/`data:` value reaching one of these would be click-to-execute XSS. The backend
 * already enforces http(s) on these fields (place_extractor.is_placeholder_url; reel URLs are
 * https-by-construction), so this is a second line, not the only line — it keeps a future backend
 * change from turning an evidence link into an exploit. Gate the whole <a> on it so an unsafe URL
 * renders nothing rather than a dead, misleading link:
 *
 *   const href = safeHref(evidence.source_url)
 *   {href ? <a href={href} ...>…</a> : null}
 */
export function safeHref(url: string | null | undefined): string | undefined {
  return safeHrefWithBase(url, typeof window !== 'undefined' ? window.location.origin : null)
}

const FALLBACK_BASE = 'https://astrail.xyz'

/**
 * safeHref's rule with the document origin passed in, so the opaque-origin case is testable.
 *
 * An absolute URL is parsed on its own, never against a base: inside a sandboxed iframe (the
 * ChatGPT widget) `location.origin` is the string "null", and `new URL(abs, 'null')` THROWS even
 * though the base would be ignored — which made every cover and evidence link disappear there.
 * Only a relative URL needs a base: the page's own origin when it is a real http(s) origin, and
 * astrail.xyz otherwise.
 */
export function safeHrefWithBase(url: string | null | undefined, origin: string | null): string | undefined {
  if (!url) return undefined
  const protocol = parseProtocol(url, origin)
  return protocol === 'http:' || protocol === 'https:' ? url : undefined
}

/** `new URL()` in try/catch rather than URL.canParse, which older mobile webviews lack. */
function tryUrl(url: string, base?: string): URL | null {
  try {
    return new URL(url, base)
  } catch {
    return null
  }
}

function parseProtocol(url: string, origin: string | null): string | null {
  const absolute = tryUrl(url)
  if (absolute) return absolute.protocol
  const base = origin && /^https?:\/\//.test(origin) && tryUrl(origin) ? origin : FALLBACK_BASE
  return tryUrl(url, base)?.protocol ?? null
}
