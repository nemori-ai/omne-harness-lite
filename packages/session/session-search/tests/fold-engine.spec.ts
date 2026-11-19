// @module-tag slow
import { RE2JS } from 're2js'
import { describe, expect, it } from 'vitest'
import { foldText } from '../src/index.ts'

function everyPoint(): string[] {
  const points: string[] = []
  for (let code = 1; code <= 0x1ffff; code += 1)
    if (code < 0xd800 || code > 0xdfff) points.push(String.fromCodePoint(code))
  return points
}

describe('the case fold against the regular expression engine', () => {
  it('folds alike whatever the engine matches alike without case (SH-1)', () => {
    // If the engine says `x` matches `y` without case while they fold apart, a case-insensitive
    // pattern would match a text whose trigrams the index never offers: a missed hit.
    const points = everyPoint()
    const cased = points.filter(
      point => point.toUpperCase() !== point || point.toLowerCase() !== point,
    )
    const haystack = cased.join('\n')
    const apart: string[] = []
    for (const point of cased) {
      const matcher = RE2JS.compile(RE2JS.quote(point), RE2JS.CASE_INSENSITIVE).matcher(haystack)
      while (matcher.find()) {
        const other = haystack.slice(matcher.start(), matcher.end())
        if (foldText(other) !== foldText(point))
          apart.push(
            `U+${point.codePointAt(0)!.toString(16)} ~ U+${other.codePointAt(0)!.toString(16)}`,
          )
      }
    }
    expect(apart).toEqual([])
  }, 120_000)
})
