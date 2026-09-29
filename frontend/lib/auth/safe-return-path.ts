/**
 * Where to send a user after sign-in, from an UNTRUSTED `next` value (a query parameter).
 *
 * Only a same-site app path survives: exactly `/app` or something under `/app/`, optionally with
 * a query string. Anything else returns `fallback`, including everything that could leave the
 * site or smuggle a second request line: another scheme, `//host` or `/\\host` (protocol-relative
 * to a browser), backslashes, `@host`, whitespace or control characters (raw or percent-encoded,
 * e.g. %0d %0a %09), encoded slashes that decode to `//` (`/%2F%2Fevil.com`, `/%5Cevil.com`), and
 * dot segments that climb out of /app (`/app/../x`, also when encoded).
 *
 * The raw value is resolved against a sentinel origin so the URL parser does the normalisation,
 * and the result is checked in both its encoded and decoded forms.
 */
const SENTINEL = 'https://x.invalid'
const FORBIDDEN = /[\s\u0000-\u001f\u007f\\]/

function decoded(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

const isAppPath = (p: string) => p === '/app' || p.startsWith('/app/')

export function safeReturnPath(raw: string | null | undefined, fallback = '/app'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  const plain = decoded(raw)
  if (plain === null || FORBIDDEN.test(raw) || FORBIDDEN.test(plain) || plain.startsWith('//')) return fallback

  let url: URL
  try {
    url = new URL(raw, SENTINEL)
  } catch {
    return fallback
  }
  if (url.origin !== SENTINEL) return fallback
  const path = decoded(url.pathname)
  if (path === null || !isAppPath(url.pathname) || !isAppPath(path) || path.includes('//')) return fallback
  if (path.split('/').some((segment) => segment === '..' || segment === '.')) return fallback
  return `${url.pathname}${url.search}`
}
