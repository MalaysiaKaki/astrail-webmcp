// What a healthy v3 widget resource looks like, shared by the unit tests and scripts/mcp-smoke.mjs.
//
// Plain JavaScript (ESM) so the smoke script runs on the repo's Node 20 baseline, which cannot
// load TypeScript; types for TS consumers live in shell-contract.d.mts. No imports.
//
// v3 is a small HTML shell that loads two files from our own origin. The smoke used to assert
// the v2 single-file size (> 1000 chars), which every valid v3 shell fails.

/** Must equal the generated module's ITINERARY_WIDGET_ASSET_PATH (asserted in tools.test.ts). */
export const WIDGET_ASSET_PATH = '/mcp-widget/v3'
export const WIDGET_SHELL_MAX_BYTES = 2048

/**
 * @param {string} origin
 * @returns {{ js: string, css: string }}
 */
export function widgetAssetUrls(origin) {
  return { js: `${origin}${WIDGET_ASSET_PATH}/itinerary.js`, css: `${origin}${WIDGET_ASSET_PATH}/itinerary.css` }
}

/**
 * Every way `html` falls short of a v3 shell for `origin`; empty when it is healthy.
 * @param {string} html
 * @param {string} origin
 * @returns {string[]}
 */
export function widgetShellProblems(html, origin) {
  const { js, css } = widgetAssetUrls(origin)
  const problems = []
  const bytes = new TextEncoder().encode(html).length
  if (bytes > WIDGET_SHELL_MAX_BYTES) problems.push(`shell is ${bytes} B (max ${WIDGET_SHELL_MAX_BYTES})`)
  if (!html.includes('<div id="astrail-itinerary-root"></div>')) problems.push('no widget root element')
  if (!html.includes(`<script type="module" crossorigin="anonymous" src="${js}"></script>`)) problems.push(`no module script ${js}`)
  if (!html.includes(`<link rel="stylesheet" crossorigin="anonymous" href="${css}" />`)) problems.push(`no stylesheet ${css}`)
  if (html.includes('%ASSET_BASE%')) problems.push('unfilled %ASSET_BASE% placeholder')
  return problems
}

/**
 * What each fetched asset must satisfy: 200, its media type, and CORS open to the host's sandbox.
 * @param {'js' | 'css'} kind
 * @param {{ status: number, headers: { get(name: string): string | null } }} res
 * @returns {string[]}
 */
export function widgetAssetProblems(kind, res) {
  const problems = []
  const type = res.headers.get('content-type') ?? ''
  const expected = kind === 'js' ? /^(text|application)\/javascript\b/ : /^text\/css\b/
  if (res.status !== 200) problems.push(`${kind}: HTTP ${res.status}`)
  if (!expected.test(type)) problems.push(`${kind}: content-type ${type || 'missing'}`)
  if (res.headers.get('access-control-allow-origin') !== '*') problems.push(`${kind}: Access-Control-Allow-Origin is not *`)
  return problems
}
