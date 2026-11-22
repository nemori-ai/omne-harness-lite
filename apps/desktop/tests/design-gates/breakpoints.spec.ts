// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { stripCssComments } from './css-text.ts'
import { field, keyName, moduleOf, scriptStrings, type SyntaxNode, visit } from './script-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, type ScannedFile } from './scope.ts'

/**
 * FE-I23: the layout changes at three widths only: 768 (the sidebar becomes a drawer), 1100 (list and reading
 * fold into one column) and 1160 (the conversation docks its side content). A media query, a `matchMedia` string
 * and a comparison with the window or an element width use `min-width: N` or `max-width: N-1` and nothing else.
 */

const BREAKPOINTS: readonly number[] = [768, 1100, 1160]
const WIDTHS = new Set(['innerWidth', 'clientWidth', 'offsetWidth'])

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

const WIDTH_FEATURE = /\(([^()]*\bwidth\b[^()]*)\)/g

/** Whether one media feature is `min-width: N` or `max-width: N-1` at a breakpoint. */
export function onBreakpoint(feature: string): boolean {
  const match = /^(min|max)-width:(\d+)px$/.exec(feature.replace(/\s+/g, ''))
  if (match === null) return false
  const width = Number(match[2])
  return match[1] === 'min' ? BREAKPOINTS.includes(width) : BREAKPOINTS.includes(width + 1)
}

/** Width features of one media query that are not on a breakpoint, as `media (feature)`. */
export function queryViolations(query: string): string[] {
  return [...query.matchAll(WIDTH_FEATURE)]
    .filter(match => !onBreakpoint(match[1]!))
    .map(match => `media (${match[1]!.replace(/\s+/g, ' ').trim()})`)
}

const FLIPPED: Readonly<Record<string, string>> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }

/** Whether `width <operator> number` switches at a breakpoint: `< N` and `>= N`, or `<= N-1` and `> N-1`. */
function comparesAtBreakpoint(operator: string, value: number): boolean {
  if (operator === '<' || operator === '>=') return BREAKPOINTS.includes(value)
  if (operator === '<=' || operator === '>') return BREAKPOINTS.includes(value + 1)
  return false
}

const numberOf = (node: SyntaxNode | undefined): number | undefined =>
  node?.type === 'Literal' && typeof node['value'] === 'number' ? node['value'] : undefined

/** Comparisons of `innerWidth`, `clientWidth` or `offsetWidth` with a number off the breakpoints. */
export function comparisonViolations(file: Source): string[] {
  const found: string[] = []
  visit(moduleOf(file), node => {
    if (node.type !== 'BinaryExpression') return
    const operator = node['operator'] as string
    if (!/^(?:[<>]=?|[!=]==?)$/.test(operator)) return
    const [left, right] = [field(node, 'left'), field(node, 'right')]
    const [leftName, rightName] = [keyName(left), keyName(right)]
    const [leftNumber, rightNumber] = [numberOf(left), numberOf(right)]
    if (leftName !== undefined && WIDTHS.has(leftName) && rightNumber !== undefined) {
      if (!comparesAtBreakpoint(operator, rightNumber))
        found.push(`compare ${leftName} ${operator} ${rightNumber}`)
    } else if (rightName !== undefined && WIDTHS.has(rightName) && leftNumber !== undefined) {
      if (!comparesAtBreakpoint(FLIPPED[operator] ?? operator, leftNumber))
        found.push(`compare ${leftNumber} ${operator} ${rightName}`)
    }
  })
  return found
}

export function breakpointViolations(file: Source): string[] {
  if (file.kind === 'css')
    return [...stripCssComments(file.text).matchAll(/@media([^{;]+)\{/g)].flatMap(match =>
      queryViolations(match[1]!),
    )
  if (file.kind === 'html') return []
  return [
    ...scriptStrings(file)
      .filter(text => /\(\s*(?:min-|max-)?width\s*[:<>=]/.test(text))
      .flatMap(queryViolations),
    ...comparisonViolations(file),
  ]
}

export const scanBreakpoints = (files: readonly ScannedFile[]): string[] =>
  files.flatMap(file => breakpointViolations(file).map(violation => `${file.path} | ${violation}`))

describe('breakpoint gate', () => {
  it('switches the layout only at 768, 1100 and 1160', () => {
    const report = ratchet('breakpoints', tally(scanBreakpoints(FILES)))
    expect(
      report.missing,
      'baselines/breakpoints.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(
      report.added,
      'new widths: use min-width: N or max-width: N-1 with N in 768, 1100, 1160',
    ).toEqual([])
    expect(
      report.stale,
      'fixed widths: shrink baselines/breakpoints.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('recognises each way a width is written in a stylesheet and in a script', () => {
    expect(
      breakpointViolations({
        path: 'a.css',
        kind: 'css',
        text: '@media (min-width: 768px) {} @media (max-width: 1099px) {} @media (hover: none), (max-width: 767px) {} @media (min-width: 1024px) {} @media (max-width: 768px) {} @media (width >= 1100px) {} @media screen and (min-width: 40rem) {} @media (prefers-reduced-motion: reduce) {} /* @media (min-width: 9px) {} */',
      }),
    ).toEqual([
      'media (min-width: 1024px)',
      'media (max-width: 768px)',
      'media (width >= 1100px)',
      'media (min-width: 40rem)',
    ])
    expect(
      breakpointViolations({
        path: 'a.ts',
        kind: 'ts',
        text: [
          "const NARROW = '(max-width: 767px)'",
          "const WIDE = window.matchMedia('(min-width: 1200px)')",
          '// matchMedia("(min-width: 1px)") in a comment',
          'if (window.innerWidth >= 768 && 1160 <= node.clientWidth && node.offsetWidth > 1099) go()',
          'if (window.innerWidth < 900 || node.clientWidth === 768 || 640 > el.offsetWidth) stop()',
          'if (rect.width < 300) other()',
        ].join('\n'),
      }),
    ).toEqual([
      'media (min-width: 1200px)',
      'compare innerWidth < 900',
      'compare clientWidth === 768',
      'compare 640 > offsetWidth',
    ])
  })
})
