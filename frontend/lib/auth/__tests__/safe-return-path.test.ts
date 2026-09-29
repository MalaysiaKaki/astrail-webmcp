import { describe, expect, it } from 'vitest'
import { safeReturnPath } from '../safe-return-path'

const TRIP = '/app/trip/3f1c9b2e-8d4a-4c7e-9b1a-2e6f0d5c4a7b'

describe('safeReturnPath', () => {
  it.each([
    ['/app', '/app'],
    ['/app/', '/app/'],
    [TRIP, TRIP],
    [`${TRIP}?x=1`, `${TRIP}?x=1`],
    ['/app/trips?tab=saved&sort=new', '/app/trips?tab=saved&sort=new'],
    ['/app/trip/abc#fragment', '/app/trip/abc'],
    // a dot segment that stays inside /app is normalised, not rejected
    ['/app/./trip', '/app/trip'],
  ])('keeps the app path %s', (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected)
  })

  it.each([
    // missing / not a path
    [null], [undefined], [''], ['app/trips'], ['trips'],
    // outside /app
    ['/'], ['/sign-in'], ['/apple'], ['/application'], ['/api/mcp/static-map'],
    // other origins and schemes
    ['https://evil.com'], ['http://evil.com/app'], ['javascript:alert(1)'], ['data:text/html,x'],
    ['//evil.com'], ['//evil.com/app'], ['/\\evil.com'], ['\\\\evil.com'],
    ['@evil.com'], ['/@evil.com'], ['evil.com/app'],
    // backslashes anywhere
    ['/app\\..\\..\\evil'], ['/app/trip\\x'],
    // whitespace and control characters, raw and percent-encoded
    [' /app'], ['/app\t'], ['/app\r\nSet-Cookie: x=1'], ['/app/%0d%0aLocation:%20https://evil.com'],
    ['/app/%09'], ['/app/%00'], ['/app?q=%0a'],
    // encoded slashes and backslashes
    ['/%2F%2Fevil.com'], ['/%2f%2fevil.com'], ['/%5Cevil.com'], ['/app/%2F%2Fevil.com'], ['/app/%5C'],
    // dot segments climbing out of /app (raw and encoded)
    ['/app/../x'], ['/app/../../evil.com'], ['/app/%2e%2e/x'], ['/app/.%2e/x'],
    // malformed encoding
    ['/app/%E0%A4%A'],
  ])('rejects %j', (raw) => {
    expect(safeReturnPath(raw)).toBe('/app')
  })

  it('returns the caller\'s fallback on rejection', () => {
    expect(safeReturnPath('//evil.com', '')).toBe('')
    expect(safeReturnPath('https://evil.com', '/app/trips')).toBe('/app/trips')
  })
})
