import { describe, expect, it } from 'vitest'
import * as ui from '@/lib/shell/ui'

const recipes = Object.entries(ui).filter((e): e is [string, string] => typeof e[1] === 'string')

describe('/app class recipes', () => {
  it('never set a literal font size under 12px', () => {
    for (const [name, cls] of recipes) {
      expect(cls, name).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/)
      expect(cls, name).not.toMatch(/\btext-(?:xs|\[10px\]|\[11px\])\b/)
    }
  })

  it('give every interactive recipe a keyboard focus style', () => {
    for (const name of ['GROUP_ROW', 'INPUT', 'TEXT_BUTTON', 'DESTRUCTIVE_BUTTON'] as const) {
      expect(ui[name], name).toContain('focus-visible:')
    }
  })

  it('keep interactive recipes at 44px or taller', () => {
    expect(ui.TEXT_BUTTON).toContain('min-h-11')
    expect(ui.DESTRUCTIVE_BUTTON).toContain('min-h-11')
    expect(ui.GROUP_ROW).toContain('min-h-14')
    expect(ui.INPUT).toContain('min-h-12')
  })

  it('do not override a colour on a kit class that owns it (unlayered kit wins)', () => {
    for (const [name, cls] of recipes) {
      const classes = cls.split(/\s+/)
      if (classes.includes('t-meta')) expect(cls, name).not.toMatch(/(?:^|\s)text-\[color:/)
      if (classes.some((c) => c === 'm-btn-primary' || c === 'm-btn-secondary')) {
        expect(cls, name).not.toMatch(/(?:^|\s)(?:text|bg)-\[color:/)
      }
    }
  })
})
