// @module-tag source-text
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cssRules, normalise, valueOf } from './design-gates/css-text.ts'

/** Where the stylesheet puts things: the page under test draws no boxes, so the rendering tests cannot see it. */
const RULES = cssRules(readFileSync(new URL('../src/page/styles.css', import.meta.url), 'utf8'))

const RAIL = ".shell-navigation-content[data-expanded='false']"
const EXPANDED = ".shell-navigation-content[data-expanded='true']"
const NARROW = normalise('@media (max-width: 767px)')

/** The value of `property` in the one rule with this selector, inside these at-rules. */
function value(selector: string, property: string, context: readonly string[] = []): string {
  const found = RULES.filter(
    rule => rule.selector === normalise(selector) && rule.context.join() === context.join(),
  )
  expect(found, selector).toHaveLength(1)
  return normalise(valueOf(found[0]!, property) ?? '')
}

describe('外壳的版式：侧栏底部（OD-22）', () => {
  it('utility 段的页面排成一行安静的项（来源 `.shell-utility-nav`）：排不下才换行，每项长到分满这一行；窄条里收成一列', () => {
    expect(value('.shell-utility-nav', 'display')).toBe('flex')
    expect(value('.shell-utility-nav', 'flex-wrap')).toBe('wrap')
    expect(value('.shell-utility-nav', 'gap')).toBe('1px')
    expect(value(`${RAIL} .shell-utility-nav`, 'flex-direction')).toBe('column')
  })

  it('一项是图标加名字（来源 `.shell-utility-button`）：字与图标隔 8，行首的一项与导航的图标同一列，别的项内边距收到 8（三项在四档字号下排成一行由观感走查量）', () => {
    const ITEM = `${EXPANDED} .shell-utility-nav > .shell-nav-link`
    expect(value(ITEM, 'flex')).toBe('1 0 auto')
    expect(value(ITEM, 'width')).toBe('auto')
    expect(value(ITEM, 'gap')).toBe(normalise('calc(var(--spacing) * 2)'))
    expect(value(ITEM, 'min-height')).toBe('var(--omne-control-height)')
    expect(value(ITEM, 'padding-inline')).toBe(normalise('calc(var(--spacing) * 2)'))
    expect(value(`${ITEM}:first-child`, 'padding-inline-start')).toBe(
      normalise('calc((var(--omne-nav-row-height) - var(--omne-icon-label)) / 2)'),
    )
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
  it('侧栏区的项在窄条里站在列的中线上，别的圆的圆心都在那里', () => {
    expect(value('.shell-sidebar-item[data-rail]', 'display')).toBe('flex')
    expect(value('.shell-sidebar-item[data-rail]', 'justify-content')).toBe('center')
  })

  it('「外观」在窄条里是和导航行一样宽的圆', () => {
    expect(value(`${RAIL} .shell-appearance`, 'width')).toBe('var(--omne-nav-row-height)')
    expect(value(`${RAIL} .shell-appearance`, 'height')).toBe('var(--omne-nav-row-height)')
  })
})

describe('外壳的版式：窄窗口（OD-19）', () => {
  it('窄于 768 时侧栏是页面角上并排的家与抽屉的开关', () => {
    expect(value('.shell-sidebar', 'position', [NARROW])).toBe('fixed')
    expect(value('.shell-sidebar', 'flex-direction', [NARROW])).toBe('row')
    expect(value('.shell-sidebar', 'width', [NARROW])).toBe('auto')
  })
})
