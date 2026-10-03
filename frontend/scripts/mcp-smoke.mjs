// End-to-end smoke test for the remote MCP server (docs/deploy/2026-09-29-mcp-app-rollout.md).
//
//   MCP_ACCESS_TOKEN=<resource token> [MCP_URL=http://localhost:3100/mcp] npm run smoke:mcp
//
// Needs a REAL OAuth access token issued for this MCP resource (e.g. from MCP Inspector after
// consent) — never a website session token. The token is only sent as a Bearer header; it is
// never printed. Exits non-zero on the first failed expectation.
import assert from 'node:assert/strict'
// Plain JS (with a .d.mts for TypeScript) so this runs on the repo's Node 20 baseline.
import { widgetAssetProblems, widgetAssetUrls, widgetShellProblems } from '../lib/mcp/widget/shell-contract.mjs'

const endpoint = process.env.MCP_URL || 'http://localhost:3100/mcp'
const token = process.env.MCP_ACCESS_TOKEN
assert.ok(token, 'Set MCP_ACCESS_TOKEN to an OAuth access token issued for this MCP resource.')

let protocolVersion = '2025-06-18'
let id = 0

async function post(body) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
}

async function rpc(method, params) {
  const res = await post({ jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) })
  assert.equal(res.status, 200, `${method}: HTTP ${res.status} ${res.headers.get('www-authenticate') ?? ''}`)
  const body = await res.json()
  assert.equal(body.error, undefined, `${method}: ${JSON.stringify(body.error)}`)
  return body.result
}

const call = (name, args = {}) => rpc('tools/call', { name, arguments: args })
const text = (result) => result.content?.find((c) => c.type === 'text')?.text ?? ''
const firstLine = (result) => text(result).split('\n')[0]

function step(label, detail) {
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

const init = await rpc('initialize', {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: 'astrail-mcp-smoke', version: '1.0.0' },
})
protocolVersion = init.protocolVersion
assert.equal(init.serverInfo.name, 'astrail')
step('initialize', `protocol ${protocolVersion}`)

const note = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
assert.equal(note.status, 202)
step('notifications/initialized', '202')

const tools = (await rpc('tools/list')).tools
assert.deepEqual(tools.map((t) => t.name).sort(), [
  'get_itinerary', 'get_profile', 'list_saved_reels', 'list_trips', 'open_trip_library', 'open_trip_panel', 'render_itinerary',
])
for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, `${t.name} must be read-only`)
step('tools/list', tools.map((t) => t.name).join(', '))

const profile = await call('get_profile')
assert.notEqual(profile.isError, true, text(profile))
assert.ok(profile.structuredContent?.id, 'profile id missing')
step('get_profile', `id ${String(profile.structuredContent.id).slice(0, 8)}…`)

const trips = await call('list_trips', { limit: 5 })
assert.notEqual(trips.isError, true, text(trips))
const tripList = trips.structuredContent.trips
step('list_trips', `${tripList.length} trip(s)`)

if (tripList.length > 0) {
  const tripId = tripList[0].trip_id
  const it = await call('get_itinerary', { trip_id: tripId })
  assert.notEqual(it.isError, true, text(it))
  const days = it.structuredContent.days
  const stops = days.reduce((n, d) => n + d.stops.length, 0)
  step('get_itinerary', `${days.length} day(s), ${stops} stop(s), ${it.structuredContent.hotels.length} hotel(s)`)

  if (days.length > 0) {
    const d = days[0].day_number
    const one = await call('get_itinerary', { trip_id: tripId, day: d })
    assert.notEqual(one.isError, true, text(one))
    assert.deepEqual(one.structuredContent.days_shown, [d])
    step('get_itinerary (single day)', `day ${d}`)
  }

  const render = await call('render_itinerary', { trip_id: tripId })
  assert.notEqual(render.isError, true, text(render))
  assert.ok(render._meta?.['astrail/bundle']?.bundle?.trip?.id === tripId, 'widget bundle missing from _meta')
  step('render_itinerary', 'summary + widget bundle in _meta')

  const badDay = await call('get_itinerary', { trip_id: tripId, day: 30 })
  assert.equal(badDay.isError, true, 'day 30 should be an error')
  step('negative: nonexistent day', firstLine(badDay))
}

const foreign = await call('get_itinerary', { trip_id: '11111111-1111-4111-8111-111111111111' })
assert.equal(foreign.isError, true, 'unknown trip should be an error')
step('negative: unknown trip', firstLine(foreign))

const invalid = await call('get_itinerary', { trip_id: 'abc' })
assert.equal(invalid.isError, true, 'invalid trip_id should be an error')
step('negative: invalid trip_id', 'rejected before any backend call')

const reels = await call('list_saved_reels', { limit: 5 })
assert.notEqual(reels.isError, true, text(reels))
step('list_saved_reels', `${reels.structuredContent.reels.length} reel(s)`)

const resource = await rpc('resources/read', { uri: 'ui://astrail/itinerary-v3.html' })
const content = resource.contents?.[0]
assert.equal(content?.mimeType, 'text/html;profile=mcp-app')
// v3: a small shell that loads its JS/CSS from the MCP server's own origin (lib/mcp/widget/shell-contract.mjs).
const origin = new URL(endpoint).origin
const shellProblems = widgetShellProblems(content?.text ?? '', origin)
assert.deepEqual(shellProblems, [], `widget shell: ${shellProblems.join('; ')}`)
step('resources/read', `shell ${Buffer.byteLength(content.text)} B, CSP ${JSON.stringify(content._meta?.ui?.csp?.resourceDomains ?? [])}`)

// Fetched as the host's sandboxed frame would: no credentials, from an opaque ("null") origin.
for (const [kind, url] of Object.entries(widgetAssetUrls(origin))) {
  const res = await fetch(url, { credentials: 'omit', headers: { Origin: 'null' }, signal: AbortSignal.timeout(20_000) })
  const problems = widgetAssetProblems(kind, res)
  const bytes = (await res.arrayBuffer()).byteLength
  assert.deepEqual(problems, [], problems.join('; '))
  step(`widget ${kind}`, `200 ${res.headers.get('content-type')}, ${Math.round(bytes / 1024)} KiB, CORS *`)
}

const noAuth = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/list' }),
})
assert.equal(noAuth.status, 401)
assert.match(noAuth.headers.get('www-authenticate') ?? '', /resource_metadata=/)
step('negative: no token', '401 with resource_metadata challenge')

console.log(`\nMCP smoke passed against ${endpoint}`)
