import { describe, expect, it } from 'vitest'
import { commentViolations } from '../src/hygiene/checks.ts'
import { isCheckedSource } from '../src/hygiene/measure.ts'
import { measureSource } from '../src/hygiene/source.ts'
import { SOURCE, emptyBaseline, measured } from './fixtures/hygiene/support.ts'

const count = (text: string) => measureSource(SOURCE, text, 150).comments.count

describe('hygiene-comment-forms', () => {
  it('counts nothing for clean code and ordinary comments', () => {
    expect(count('const a = 1\n// 说明一句\n/* 又一句 */\nconst b = 2')).toBe(0)
    expect(count('const a = 1')).toBe(0)
  })

  it.each([
    '// R12-D3 决定',
    '// 见 D-89',
    '// RFC-12',
    '// 卡 #1249',
    '// 阶段 2 才做',
    '// TODO later',
    '/* FIXME */',
    '/** XXX here */',
    '// HACK around',
  ])('counts one violation for %s', text => {
    expect(count(`const a = 1\n${text}\nconst b = 2`)).toBe(1)
  })

  it('counts each offending comment, including trailing ones', () => {
    expect(count('const a = 1 // TODO x\n// #123\nconst b = 2 /* FIXME */')).toBe(3)
  })

  it('does not count tool annotations', () => {
    const text = [
      '// eslint-disable-next-line TODO',
      '// oxlint-disable-next-line #1234',
      '// @ts-expect-error TODO',
      '/* v8 ignore next -- TODO */',
      '/* c8 ignore next #1234 */',
      '/* istanbul ignore next TODO */',
      '// Stryker disable next-line all: FIXME',
      '// @vitest-environment node TODO',
      'const a = 1',
    ].join('\n')
    expect(count(text)).toBe(0)
  })

  it('counts a file-opening comment block of five lines or more once', () => {
    const block = Array.from({ length: 5 }, (_, index) => `// 第 ${index} 行`).join('\n')
    expect(count(`${block}\nconst a = 1`)).toBe(1)
    expect(count(`#!/usr/bin/env node\n${block}\nimport x from 'y'`)).toBe(1)
    const four = Array.from({ length: 4 }, (_, index) => `// 第 ${index} 行`).join('\n')
    expect(count(`${four}\nconst a = 1`)).toBe(0)
    expect(count(`/*\n1\n2\n3\n4\n*/\nconst a = 1`)).toBe(1)
  })

  it('does not join header comments that a blank line separates', () => {
    const three = (from: number) =>
      Array.from({ length: 3 }, (_, index) => `// 第 ${from + index} 行`).join('\n')
    expect(count(`${three(0)}\n\n${three(3)}\nconst a = 1`)).toBe(0)
    expect(count(`${three(0)}\n${three(3)}\nconst a = 1`)).toBe(1)
  })

  it('counts a long header block once even when its lines also match a form', () => {
    const block = ['// TODO', '// 二', '// 三', '// 四', '// 五 #123'].join('\n')
    expect(count(`${block}\nconst a = 1`)).toBe(1)
  })

  it('does not count a long comment block after the first statement', () => {
    const block = Array.from({ length: 6 }, (_, index) => `// 第 ${index} 行`).join('\n')
    expect(count(`const a = 1\n${block}\nconst b = 2`)).toBe(0)
  })

  it('reads comments from the syntax, not from text that only looks like one', () => {
    expect(
      count("const url = 'http://x/#123'\nconst re = /\\/\\/ TODO/\nconst t = `// FIXME`"),
    ).toBe(0)
  })

  it('reports the line of the first hit', () => {
    expect(measureSource(SOURCE, 'a\n\n// TODO\n// #123', 150).comments.firstLine).toBe(3)
  })

  it('reports only a file whose count exceeds the baseline', () => {
    const sources = [{ path: SOURCE, text: 'const a = 1\n// TODO\n// TODO\n' }]
    const current = measured({ sources })
    expect(commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 2 } }))).toEqual([])
    expect(commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 3 } }))).toEqual([])
    const [found] = commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 1 } }))
    expect(found).toMatchObject({ rule: 'hygiene-comment-forms', path: SOURCE, line: 2 })
    expect(found?.message).toBe('被禁止的注释形式 2 条，基线 1 条')
    expect(commentViolations(current, emptyBaseline())[0]?.message).toContain('基线 0 条')
  })

  it('checks only production sources under packages, apps and tools', () => {
    expect(isCheckedSource('packages/a/b/src/x.ts')).toBe(true)
    expect(isCheckedSource('apps/a/src/x.tsx')).toBe(true)
    expect(isCheckedSource('tools/a/src/x.mjs')).toBe(true)
    expect(isCheckedSource('tools/a/src/x.mts')).toBe(true)
    expect(isCheckedSource('packages/a/b/tests/x.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/src/x.spec.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/src/node_modules/x.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/src/x.d.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/src/x.generated.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/scripts/x.ts')).toBe(false)
    expect(isCheckedSource('scripts/src/x.ts')).toBe(false)
    expect(isCheckedSource('packages/a/b/src/x.js')).toBe(false)
  })
})
