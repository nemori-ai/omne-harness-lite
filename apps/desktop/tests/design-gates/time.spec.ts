// @module-tag source-text
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { KIT } from './scope.ts'
import {
  field,
  jsxName,
  moduleOf,
  parseModule,
  SCRIPTS,
  type SyntaxNode,
  violation,
  visit,
} from './source-text.ts'

/**
 * FE-I33: a moment is written once, by `Ago`, through its one formatting module `patterns/time.ts` (`Ago` imports
 * nothing else). A page that formats an instant itself is where a raw UTC tooltip or a second clock format comes
 * from, so each such call outside those two files is counted, and the count only shrinks. Reading the time zone
 * through `Intl.DateTimeFormat().resolvedOptions()` formats nothing and is not counted; neither is an ISO string
 * handed to `Ago` or to `dateTime`, which a person never reads.
 */
const OWNERS = new Set([join(KIT, 'src/patterns/ago.tsx'), join(KIT, 'src/patterns/time.ts')])
const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])
const INTL_FORMATS = new Set(['DateTimeFormat', 'RelativeTimeFormat'])
const MACHINE_ATTRIBUTES = new Set(['dateTime'])

function propertyName(member: SyntaxNode | undefined): string {
  if (member?.type !== 'MemberExpression' || member['computed'] === true) return ''
  return String(field(member, 'property')?.['name'] ?? '')
}

function intlFormat(callee: SyntaxNode | undefined): string | undefined {
  const name = propertyName(callee)
  const object = callee === undefined ? undefined : field(callee, 'object')
  return INTL_FORMATS.has(name) && object?.type === 'Identifier' && object['name'] === 'Intl'
    ? `Intl.${name}`
    : undefined
}

/** Whether an ISO string sits where a person reads it: a JSX child, or an attribute other than `Ago`'s or `dateTime`. */
function shownInJsx(ancestors: readonly SyntaxNode[]): boolean {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index]
    if (node?.type !== 'JSXExpressionContainer') continue
    const parent = ancestors[index - 1]
    if (parent?.type !== 'JSXAttribute') return true
    const opening = ancestors[index - 2]
    const tag = opening === undefined ? '' : jsxName(field(opening, 'name'))
    return !(tag === 'Ago' || MACHINE_ATTRIBUTES.has(jsxName(field(parent, 'name'))))
  }
  return false
}

export function timeFormatting(tree: SyntaxNode): string[] {
  const found: string[] = []
  visit(tree, (node, ancestors) => {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return
    const callee = field(node, 'callee')
    const method = propertyName(callee)
    const parent = ancestors.at(-1)
    const intl = intlFormat(callee)
    if (intl !== undefined && propertyName(parent) !== 'resolvedOptions') found.push(intl)
    if (node.type !== 'CallExpression') return
    if (LOCALE_METHODS.has(method)) found.push(method)
    if (method === 'toISOString' && shownInJsx(ancestors)) found.push('toISOString in JSX')
  })
  return found
}

describe('time gate', () => {
  it('formats instants only through Ago and its formatting module', () => {
    const found = SCRIPTS.filter(file => !OWNERS.has(file.path)).flatMap(file =>
      timeFormatting(moduleOf(file)).map(call => violation(file.path, call)),
    )
    const report = ratchet('time', tally(found))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(report.added, 'a page formatting an instant itself: render <Ago at=…>').toEqual([])
    expect(report.stale, 'moved onto Ago; shrink time.json with DESIGN_GATES_SHRINK=1').toEqual([])
  })

  it('recognises each way a page formats an instant and leaves the rest alone', () => {
    const source = `
      new Date(at).toLocaleString(); d.toLocaleDateString('zh'); d.toLocaleTimeString()
      new Intl.DateTimeFormat('zh').format(d); Intl.RelativeTimeFormat('zh'); new Intl.NumberFormat('zh')
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; const iso = d.toISOString()
      const view = <time dateTime={d.toISOString()} title={d.toISOString()}>{d.toISOString()}<Ago at={d.toISOString()} /></time>`
    expect(timeFormatting(parseModule('sample.tsx', source))).toEqual([
      'toLocaleString',
      'toLocaleDateString',
      'toLocaleTimeString',
      'Intl.DateTimeFormat',
      'Intl.RelativeTimeFormat',
      'toISOString in JSX',
      'toISOString in JSX',
    ])
  })
})
