// @module-tag source-text
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cssRules, normalise, valueOf } from './design-gates/css-text.ts'

/** Where the stylesheet puts things: the page under test draws no boxes, so the rendering tests cannot see it. */
const RULES = cssRules(readFileSync(new URL('../src/page/styles.css', import.meta.url), 'utf8'))

const RAIL = ".shell-navigation-content[data-expanded='false']"

/** The value of `property` in the one rule with this selector, inside these at-rules. */
function value(selector: string, property: string, context: readonly string[] = []): string {
  const found = RULES.filter(
    rule => rule.selector === normalise(selector) && rule.context.join() === context.join(),
  )
  expect(found, selector).toHaveLength(1)
  return normalise(valueOf(found[0]!, property) ?? '')
}

describe('外壳的版式：侧栏底部（OD-22）', () => {
  it('utility 段的页面排成两列的网格；窄条里收成一列', () => {
    expect(value('.shell-utility-nav', 'display')).toBe('grid')
    expect(value('.shell-utility-nav', 'grid-template-columns')).toBe('repeat(2,minmax(0,1fr))')
    expect(value(`${RAIL} .shell-utility-nav`, 'grid-template-columns')).toBe('minmax(0,1fr)')
  })

  it('选中的一格画的是导航行选中时的那一种底', () => {
    expect(
      value(".shell-utility-nav > .shell-nav-link[data-selected='true']", 'background-color'),
    ).toBe('var(--omne-selected)')
  })

  it('最后一行左右两头各一样，底边对齐：左边的通知往上长，「外观」不跟着挪', () => {
    expect(value('.shell-footer-row', 'justify-content')).toBe('space-between')
    expect(value('.shell-footer-row', 'align-items')).toBe('flex-end')
  })
})

describe('外壳的版式：窄条', () => {
  it('「外观」在窄条里是和导航行一样宽的圆', () => {
    expect(value(`${RAIL} .shell-appearance`, 'width')).toBe('var(--omne-nav-row-height)')
    expect(value(`${RAIL} .shell-appearance`, 'height')).toBe('var(--omne-nav-row-height)')
  })
})
