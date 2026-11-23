// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BUILTIN_LAYER, cssRules, stripCssComments } from './css-text.ts'
import { FILES, KIT, REPOSITORY, isKit } from './scope.ts'

/**
 * FE-I40: every rule of the kit, of an assembled view module and of the page is in a cascade layer, and the one
 * layer for changes is the last. A rule outside every layer would beat that layer whatever it says.
 */

const ORDER = [
  'properties',
  'theme',
  'base',
  'components',
  'utilities',
  'omne-builtin',
  'omne-changes',
]
const LAYERS_FILE = join(KIT, 'src', 'styles', 'layers.css')
const KIT_ENTRY = join(KIT, 'src', 'styles.css')
const KIT_BASE = join(KIT, 'src', 'styles', 'base.css')
const LAYERS_IMPORT = "@import '@omne-harness/ui-kit/layers.css';"

const sheets = FILES.filter(file => file.kind === 'css')

function imports(text: string): string[] {
  return stripCssComments(text)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('@import'))
}

/** The rules of one sheet that no layer holds, as their selectors. */
export function unlayered(text: string, layers: readonly string[]): string[] {
  return cssRules(text)
    .filter(rule => !layers.includes(rule.context[0] ?? ''))
    .map(rule => rule.selector)
}

describe('自带的样式都在层里，改动的那一层在最后', () => {
  it('层的次序只写在一处，最后两层是自带的与改动', () => {
    const text = readFileSync(join(REPOSITORY, LAYERS_FILE), 'utf8').trim()
    expect(text).toBe(`@layer ${ORDER.join(', ')};`)
  })

  it('共用件的入口先声明次序，它带进来的每一份样式都进自带的那一层', () => {
    const lines = imports(readFileSync(join(REPOSITORY, KIT_ENTRY), 'utf8'))
    expect(lines[0]).toBe("@import './styles/layers.css';")
    const own = [
      "@import './styles/layers.css';",
      "@import 'tailwindcss';",
      "@import './styles/base.css';",
    ]
    const loose = lines.filter(
      line => !own.includes(line) && !line.endsWith(' layer(omne-builtin);'),
    )
    expect(loose).toEqual([])
  })

  it('共用件里自己写层的那一份，层外没有规则', () => {
    const text = readFileSync(join(REPOSITORY, KIT_BASE), 'utf8')
    expect(unlayered(text, ['@layer base', BUILTIN_LAYER])).toEqual([])
  })

  it('界面模块与页面的每一份样式先带进层的次序，规则都在自带的那一层里', () => {
    const outside = sheets.filter(file => !isKit(file.path))
    expect(outside.length).toBeGreaterThan(0)
    const missing = outside
      .filter(file => {
        const first = imports(file.text)[0] ?? ''
        return first !== LAYERS_IMPORT && first !== "@import '@omne-harness/ui-kit/styles.css';"
      })
      .map(file => file.path)
    expect(missing).toEqual([])
    const loose = outside.flatMap(file =>
      unlayered(file.text, [BUILTIN_LAYER]).map(selector => `${file.path}: ${selector}`),
    )
    expect(loose).toEqual([])
  })

  it('这道门认得出层外的规则', () => {
    const text = `@layer omne-builtin {\n.a { color: red; }\n}\n.b { color: red; }\n@media (min-width: 768px) { .c { color: red; } }`
    expect(unlayered(text, [BUILTIN_LAYER])).toEqual(['.b', '.c'])
  })
})
