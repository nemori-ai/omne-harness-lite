// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { PART_ATTRIBUTE } from '@omne-harness/shell-contract'
import { shellParts } from '../../src/page/shell/parts.ts'
import * as surface from '../../src/page/surface/parts.ts'
import { FILES } from './scope.ts'

/** A surface with no client tree cannot import the contract: it takes the attribute and the names from this one file. */
const SURFACE_NAMES = 'apps/desktop/src/page/surface/parts.ts'

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
    expect(namedByHand(FILES).filter(path => path !== SURFACE_NAMES)).toEqual([])
  })

  it('没有树的画面从一处取名字：那里的属性名就是契约里的，每个名字都是外壳声明过的部位', () => {
    expect(surface.PART_ATTRIBUTE).toBe(PART_ATTRIBUTE)
    expect(surface.partOf('some.part')).toEqual({ [PART_ATTRIBUTE]: 'some.part' })
    const declared = new Set(shellParts.map(part => part.declaration.name))
    const names = Object.entries(surface).flatMap(([key, value]) =>
      key.endsWith('_PART') && typeof value === 'string' ? [value] : [],
    )
    expect(names.length).toBe(5)
    expect(names.filter(name => !declared.has(name))).toEqual([])
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
