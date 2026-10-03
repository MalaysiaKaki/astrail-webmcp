// The widget renders the UNCHANGED trip components from the real McpTripBundle, so it needs no
// casts (docs/mcp-app/PLAN.md §6). This guard keeps it that way: a cast to a domain type (or to
// `any` / through `unknown`) would silently re-open the gap the contract's _Assignable proof
// closes. Tests are exempt — they build deliberately malformed input.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('../..', import.meta.url))
const srcDirs = ['../src', '../library'].map((dir) => fileURLToPath(new URL(dir, import.meta.url)))

const DOMAIN_TYPES = [
  'TripBundle', 'Trip', 'TripPlace', 'TripDay', 'Place', 'TransportLeg',
  'RestaurantSuggestion', 'HotelSuggestion', 'McpTripBundle',
]
const FORBIDDEN = [
  { label: '`: any`', pattern: /:\s*any\b/ },
  { label: '`as any`', pattern: /\bas\s+any\b/ },
  { label: '`as unknown`', pattern: /\bas\s+unknown\b/ },
  { label: 'domain-type cast', pattern: new RegExp(`\\bas\\s+(${DOMAIN_TYPES.join('|')})\\b`) },
]

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const violations = []
for (const file of srcDirs.flatMap(sourceFiles)) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const { label, pattern } of FORBIDDEN) {
      if (pattern.test(line)) violations.push(`${relative(frontend, file)}:${i + 1}: ${label}: ${line.trim()}`)
    }
  })
}

if (violations.length > 0) {
  console.error(`check-casts: ${violations.length} forbidden cast(s) in mcp-app/src or mcp-app/library:\n${violations.join('\n')}`)
  process.exit(1)
}
console.log('check-casts: no domain-type or any casts in mcp-app/src or mcp-app/library')
