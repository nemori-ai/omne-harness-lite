import { describe, expect, it } from 'vitest'
import { sizeViolations } from '../src/hygiene/checks.ts'
import { measureSource } from '../src/hygiene/source.ts'
import {
  SOURCE,
  emptyBaseline,
  longFunction,
  measured,
  repeat,
} from './fixtures/hygiene/support.ts'

const fileOf = (lines: number) => `${repeat('void 0', lines)}\n`

describe('hygiene-size-bands', () => {
  it('measures function spans over every function-like node', () => {
    const text = [
      longFunction('declared', 151),
      `export const arrow = () => {\n${repeat('  void 0', 150)}\n}\n`,
      `export class K {\n  constructor() {\n${repeat('    void 0', 151)}\n  }\n  method() {\n${repeat('    void 0', 152)}\n  }\n  get g() {\n${repeat('    void 0', 160)}\n    return 1\n  }\n}\n`,
      `export const fx = function () {\n${repeat('  void 0', 200)}\n}\n`,
    ].join('')
    const found = measureSource(SOURCE, text, 150).functions
    expect(found.count).toBe(6)
    expect(found.longest).toBe(202)
  })

  it('does not count functions at or under the limit', () => {
    expect(measureSource(SOURCE, longFunction('f', 150), 150).functions.count).toBe(0)
    expect(measureSource(SOURCE, longFunction('f', 151), 150).functions.count).toBe(1)
  })

  it('reports the start line of the longest function', () => {
    const text = `${longFunction('short', 151)}${longFunction('long', 300)}`
    expect(measureSource(SOURCE, text, 150).functions.longestLine).toBe(152)
  })

  it('counts file lines without the trailing newline', () => {
    expect(measureSource(SOURCE, fileOf(1000), 150).lines).toBe(1000)
    expect(measureSource(SOURCE, fileOf(1001), 150).lines).toBe(1001)
  })

  it('accepts files and functions within the baseline', () => {
    const sources = [{ path: SOURCE, text: `${fileOf(1100)}${longFunction('f', 200)}` }]
    const baseline = emptyBaseline({
      sizes: {
        files: { [SOURCE]: 1400 },
        functions: { [SOURCE]: { count: 1, longest: 200 } },
      },
    })
    expect(sizeViolations(measured({ sources }), baseline)).toEqual([])
  })

  it('reports a newly over-limit file and a newly over-limit function', () => {
    const sources = [{ path: SOURCE, text: `${fileOf(1100)}${longFunction('f', 200)}` }]
    const violations = sizeViolations(measured({ sources }), emptyBaseline())
    expect(violations.map(v => v.rule)).toEqual(['hygiene-size-bands', 'hygiene-size-bands'])
    expect(violations[0]?.message).toContain('基线 无条目')
    expect(violations[1]?.line).toBe(1101)
  })

  it('reports growth past the baseline', () => {
    const sources = [{ path: SOURCE, text: `${fileOf(1100)}${longFunction('f', 200)}` }]
    const violations = sizeViolations(
      measured({ sources }),
      emptyBaseline({
        sizes: {
          files: { [SOURCE]: 1400 },
          functions: { [SOURCE]: { count: 1, longest: 199 } },
        },
      }),
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toContain('最长 200 行')
    const more = sizeViolations(
      measured({
        sources: [{ path: SOURCE, text: `${longFunction('a', 200)}${longFunction('b', 200)}` }],
      }),
      emptyBaseline({ sizes: { files: {}, functions: { [SOURCE]: { count: 1, longest: 200 } } } }),
    )
    expect(more).toHaveLength(1)
  })

  it('reports a file over the limit past its baseline lines', () => {
    const sources = [{ path: SOURCE, text: fileOf(1300) }]
    const baseline = emptyBaseline({ sizes: { files: { [SOURCE]: 1299 }, functions: {} } })
    expect(sizeViolations(measured({ sources }), baseline)).toHaveLength(1)
  })

  it('accepts a file exactly at its baseline lines', () => {
    const sources = [{ path: SOURCE, text: fileOf(1300) }]
    const baseline = emptyBaseline({ sizes: { files: { [SOURCE]: 1300 }, functions: {} } })
    expect(sizeViolations(measured({ sources }), baseline)).toEqual([])
  })

  it('does not report files at the limit', () => {
    expect(
      sizeViolations(
        measured({ sources: [{ path: SOURCE, text: fileOf(1000) }] }),
        emptyBaseline(),
      ),
    ).toEqual([])
  })
})
