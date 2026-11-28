// @module-tag source-text
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * What the account block's stylesheet gives the rail circle. The page lays the circles of the rail out in one column
 * as wide as a navigation row; the account's circle is drawn by this module, so its size is read from its own sheet.
 */
const SHEET = readFileSync(new URL('../src/view/identity-ui.css', import.meta.url), 'utf8')

/** The declarations of the one rule whose selector is exactly `selector`. */
function declarations(selector: string): Record<string, string> {
  const rules = [...SHEET.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter(
    ([, prelude]) => prelude!.replace(/\/\*[\s\S]*?\*\//gu, '').trim() === selector,
  )
  expect(rules, selector).toHaveLength(1)
  return Object.fromEntries(
    rules[0]![2]!
      .split(';')
      .map(part => part.split(':').map(side => side.trim()))
      .filter(([property, value]) => property !== '' && value !== undefined)
      .map(([property, value]) => [property!, value!]),
  )
}

describe('账号块的版式', () => {
  it('窄条里的圆和窄条里别的圆一样大：宽与高都是导航一行的高，整圆', () => {
    expect(declarations('.identity-account-rail')).toEqual({
      width: 'var(--omne-nav-row-height)',
      height: 'var(--omne-nav-row-height)',
      'border-radius': 'var(--omne-radius-pill)',
    })
  })
})
