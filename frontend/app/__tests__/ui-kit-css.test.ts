import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

// The kit is imported by the root layout, so a syntax error here breaks every page.
// A "*/" inside a comment once closed the header early and did exactly that.
const kit = readFileSync(join(__dirname, '..', 'ui-kit.css'), 'utf8')

describe('ui-kit.css', () => {
  it('parses as CSS', () => {
    expect(() => postcss.parse(kit)).not.toThrow()
  })

  it('declares the shared type scale and the core kit classes', () => {
    const root = postcss.parse(kit)
    const selectors = new Set<string>()
    const props = new Set<string>()
    root.walkRules((rule) => rule.selectors.forEach((s) => selectors.add(s)))
    root.walkDecls((decl) => props.add(decl.prop))
    for (const token of ['--t-display', '--t-body', '--t-label', '--m-shadow-1', '--m-shadow-2']) {
      expect(props).toContain(token)
    }
    for (const cls of ['.m-btn-primary', '.m-btn-secondary', '.m-btn-icon', '.m-card-link', '.ui-floating-panel', '.t-body']) {
      expect(selectors).toContain(cls)
    }
  })
})
