// @module-tag source-text
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { tally, type Census } from './ratchet.ts'
import { isKit } from './scope.ts'
import {
  field,
  jsxName,
  moduleOf,
  nodes,
  parseModule,
  SCRIPTS,
  stringText,
  type SyntaxNode,
  visit,
} from './script-text.ts'

/**
 * FE-I36: a recurring utility action is an icon button and an occasional one sits behind `⋯`; words stay on the
 * kinds the visual standard's A3 names. Every kit `Button` outside the kit whose children write text is listed in
 * `baselines/worded-buttons.json`, each key with how many of it are of each kind. One outside the register fails;
 * a count handed to a run only goes, and it goes first when a key shrinks.
 */
const KINDS = new Set(['commit', 'choice', 'primary', 'name', 'value'])
const RUN = /^R\d+b?$/u
const REGISTER = join(import.meta.dirname, 'baselines', 'worded-buttons.json')

/** How many buttons under one key are of each kind. */
type Entry = Readonly<Record<string, number>>

const countOf = (entry: Entry | undefined): number =>
  Object.values(entry ?? {}).reduce((sum, count) => sum + count, 0)

/** The entry with `count` buttons left: counts handed to a run go first, then the others. */
function shrunk(entry: Entry, count: number): Entry {
  let surplus = countOf(entry) - count
  const kinds = Object.keys(entry).sort((a, b) => Number(RUN.test(b)) - Number(RUN.test(a)))
  const kept: Record<string, number> = {}
  for (const kind of kinds) {
    const cut = Math.min(surplus, entry[kind] ?? 0)
    surplus -= cut
    if ((entry[kind] ?? 0) - cut > 0) kept[kind] = (entry[kind] ?? 0) - cut
  }
  return kept
}

const squash = (text: string): string => text.replace(/\s+/gu, ' ').trim()

/** The words an expression child writes: literals as they are, both arms of a choice, anything else as `{source}`. */
function expressionWords(node: SyntaxNode, source: string): string {
  const literal = stringText(node)
  if (literal !== undefined) return squash(literal)
  if (node.type === 'ConditionalExpression')
    return [field(node, 'consequent'), field(node, 'alternate')]
      .map(arm => (arm === undefined ? '' : expressionWords(arm, source)))
      .filter(words => words !== '')
      .join('/')
  if (node.type === 'LogicalExpression' && node['operator'] === '&&') {
    const right = field(node, 'right')
    return right === undefined ? '' : expressionWords(right, source)
  }
  if (node.type === 'ParenthesizedExpression') {
    const inner = field(node, 'expression')
    return inner === undefined ? '' : expressionWords(inner, source)
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return childWords(node, source)
  if (node.type === 'Literal' || node.type === 'JSXEmptyExpression') return ''
  return `{${squash(source.slice(node.start, node.end))}}`
}

/** The words an element's children write, nested elements included; an icon with no children writes none. */
function childWords(element: SyntaxNode, source: string): string {
  return nodes(element, 'children')
    .map(child => {
      if (child.type === 'JSXText') return squash(String(child['value']))
      if (child.type === 'JSXExpressionContainer') {
        const expression = field(child, 'expression')
        return expression === undefined ? '' : expressionWords(expression, source)
      }
      if (child.type === 'JSXElement' || child.type === 'JSXFragment')
        return childWords(child, source)
      return ''
    })
    .filter(words => words !== '')
    .join(' ')
}

/** The words of each `Button` in a module that writes any. */
export function wordedButtons(tree: SyntaxNode, source: string): string[] {
  const found: string[] = []
  visit(tree, node => {
    if (node.type !== 'JSXElement') return
    if (jsxName(field(field(node, 'openingElement') ?? node, 'name')) !== 'Button') return
    const words = childWords(node, source)
    if (words !== '') found.push(words)
  })
  return found
}

function observe(): Census {
  return tally(
    SCRIPTS.filter(file => file.kind === 'tsx' && !isKit(file.path)).flatMap(file =>
      wordedButtons(moduleOf(file), file.text).map(words => `${file.path} | ${words}`),
    ),
  )
}

function readRegister(): Map<string, Entry> | undefined {
  if (!existsSync(REGISTER)) return undefined
  const parsed = JSON.parse(readFileSync(REGISTER, 'utf8')) as { entries: Record<string, Entry> }
  return new Map(Object.entries(parsed.entries))
}

function writeRegister(entries: ReadonlyMap<string, Entry>): void {
  const sorted = Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(
    REGISTER,
    `${JSON.stringify({ gate: 'worded-buttons', entries: sorted }, null, 2)}\n`,
    'utf8',
  )
}

describe('worded buttons gate', () => {
  it('lists every worded Button outside the kit in the register, each with a kind', () => {
    const observed = observe()
    if (readRegister() === undefined && process.env['DESIGN_GATES_SEED'] === '1')
      writeRegister(new Map([...observed].map(([key, count]) => [key, { '?': count }])))
    const register = readRegister()
    expect(
      register,
      'no register: write it once with DESIGN_GATES_SEED=1, then name each kind',
    ).toBeDefined()
    const entries = register ?? new Map<string, Entry>()
    const added = [...observed]
      .filter(([key, count]) => count > countOf(entries.get(key)))
      .map(([key, count]) => `${key} (${countOf(entries.get(key))} -> ${count})`)
    const stale = [...entries]
      .filter(([key, entry]) => countOf(entry) > (observed.get(key) ?? 0))
      .map(([key, entry]) => `${key} (${countOf(entry)} -> ${observed.get(key) ?? 0})`)
    if (added.length === 0 && stale.length > 0 && process.env['DESIGN_GATES_SHRINK'] === '1') {
      const kept = new Map<string, Entry>()
      for (const [key, entry] of entries) {
        const left = shrunk(entry, Math.min(countOf(entry), observed.get(key) ?? 0))
        if (countOf(left) > 0) kept.set(key, left)
      }
      writeRegister(kept)
      stale.length = 0
    }
    const byKind = new Map<string, number>()
    for (const entry of entries.values())
      for (const [kind, count] of Object.entries(entry))
        byKind.set(kind, (byKind.get(kind) ?? 0) + count)
    process.stderr.write(
      `[design-gate worded-buttons] ${[...observed.values()].reduce((a, b) => a + b, 0)} worded buttons (${observed.size} keys); register ${[...byKind].map(([kind, count]) => `${kind} ${count}`).join(', ')}; ${added.length} new, ${stale.length} stale\n`,
    )
    expect(
      [...entries].flatMap(([key, entry]) =>
        Object.keys(entry)
          .filter(kind => !KINDS.has(kind) && !RUN.test(kind))
          .map(kind => `${key}: ${kind}`),
      ),
      'each entry names commit, choice, primary, name, value, or the run that takes it away (R7, R6b…)',
    ).toEqual([])
    expect(
      added.sort(),
      'a worded Button outside the register: make it an IconButton (A1) or put it behind ⋯ (A2); only the kinds A3 names keep words',
    ).toEqual([])
    expect(
      stale.sort(),
      'gone from the views; shrink worded-buttons.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('shrinks counts handed to a run before the others', () => {
    expect(shrunk({ commit: 2, R9: 1 }, 2)).toEqual({ commit: 2 })
    expect(shrunk({ commit: 2, R9: 1 }, 1)).toEqual({ commit: 1 })
    expect(shrunk({ name: 1 }, 0)).toEqual({})
  })

  it('reads text, choices, nested elements and expressions, and skips buttons that only draw a glyph', () => {
    const source = `<>
      <Button onClick={go}>刷新</Button>
      <Button><AddIcon />新建会话</Button>
      <Button>{busy ? '请稍候……' : '登录'}</Button>
      <Button>{editing && '完成'}</Button>
      <Button>{item.label ?? '未命名'}</Button>
      <Button asChild><a href="#a"><span>{entry.title}</span></a></Button>
      <Button>{\`还差 \${n} 题\`}</Button>
      <Button aria-label="收起侧边区"><FoldIcon /></Button>
      <IconButton label="刷新"><RetryIcon /></IconButton>
      <Button>{/* nothing */}</Button>
    </>`
    expect(wordedButtons(parseModule('sample.tsx', source), source)).toEqual([
      '刷新',
      '新建会话',
      '请稍候……/登录',
      '完成',
      "{item.label ?? '未命名'}",
      '{entry.title}',
      '还差 ${…} 题',
    ])
  })
})
