// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { FILES } from './scope.ts'

/**
 * FE-I41: an element carries the name of a part only through `part.props` of a declared part. The kit, the view
 * modules and the page never write the attribute themselves, and no built-in stylesheet selects on it.
 */
export function namedByHand(files: readonly { path: string; text: string }[]): string[] {
  return files.filter(file => file.text.includes('data-omne-part')).map(file => file.path)
}

describe('部位的名字只经声明写到元素上', () => {
  it('共用件、界面模块与页面的源码和样式里没有手写的 data-omne-part', () => {
    expect(FILES.length).toBeGreaterThan(0)
    expect(namedByHand(FILES)).toEqual([])
  })

  it('这道门认得出手写的名字', () => {
    const files = [
      { path: 'a.tsx', text: '<div data-omne-part="notes.page" />' },
      { path: 'b.tsx', text: '<div {...notesPage.props} />' },
      { path: 'c.css', text: '[data-omne-part="notes.page"] { color: red; }' },
    ]
    expect(namedByHand(files)).toEqual(['a.tsx', 'c.css'])
  })
})
