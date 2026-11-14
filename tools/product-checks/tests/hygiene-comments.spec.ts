import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS } from '../src/hygiene/baseline.ts'
import { commentViolations } from '../src/hygiene/checks.ts'
import { isCheckedSource } from '../src/hygiene/measure.ts'
import { PUBLISHED_BYTES } from '../src/hygiene/published-bytes.ts'
import { measureSource } from '../src/hygiene/source.ts'
import { SOURCE, emptyBaseline, measured, repeat } from './fixtures/hygiene/support.ts'

const LIMITS = { ...DEFAULT_LIMITS, commentRunLines: 3, commentFloorLines: 6, commentPercent: 1 }
const comments = (text: string, path = SOURCE) => measureSource(path, text, LIMITS).comments
const count = (text: string, path = SOURCE) => comments(text, path).count
const lines = (from: number, length: number) =>
  Array.from({ length }, (_, index) => `// 第 ${from + index} 行`).join('\n')
const scattered = (singles: number, total: number) =>
  `${repeat('// 一句\nconst a = 1', singles)}\n${repeat('const b = 2', total - singles * 2)}\n`

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
    expect(comments(`const a = 1\n${text}\nconst b = 2`)).toMatchObject({ count: 1, forms: 1 })
  })

  it('counts each offending comment, including trailing ones', () => {
    expect(count('const a = 1 // TODO x\n// #123\nconst b = 2 /* FIXME */')).toBe(3)
  })

  it('does not count tool annotations, whatever they say and however long they are', () => {
    const text = [
      '// eslint-disable-next-line TODO',
      '// oxlint-disable-next-line #1234',
      '// @ts-expect-error TODO',
      '/* v8 ignore next -- TODO */',
      '/* c8 ignore next #1234 */',
      '/* istanbul ignore next TODO */',
      '// Stryker disable next-line all: FIXME',
      '// @vitest-environment node TODO',
      '/// <reference path="./TODO.d.ts" />',
      '/* wall-clock: operation-timing -- TODO */',
      '// covers: PD-cli S5 TODO',
      '// brand-mint: TODO',
      '// @module-tag slow TODO',
      '// oxfmt-ignore TODO',
      'const a = 1',
    ].join('\n')
    expect(count(text)).toBe(0)
    expect(count('/**\n * @owner TODO\n * @mode strict\n * @contract x\n */\nconst a = 1')).toBe(0)
    expect(count('/**\n * 一\n * @ts-expect-error TODO\n * 二\n */\nconst a = 1')).toBe(1)
  })

  it('counts adjacent plain comments spanning three lines or more once, wherever they are', () => {
    expect(comments(`const a = 1\n${lines(0, 3)}\nconst b = 2`)).toMatchObject({
      count: 1,
      runs: 1,
      firstLine: 2,
    })
    expect(count(`${lines(0, 3)}\nconst a = 1`)).toBe(1)
    expect(count(`#!/usr/bin/env node\n${lines(0, 5)}\nimport x from 'y'`)).toBe(1)
    expect(count('const a = 1\n/*\n 一\n 二\n*/\nconst b = 2')).toBe(1)
    expect(count(`const a = 1\n${lines(0, 2)}\nconst b = 2`)).toBe(0)
    expect(count('const a = 1\n/* 一\n 二 */\nconst b = 2')).toBe(0)
  })

  it('does not join comments that a blank line or code separates', () => {
    expect(count(`${lines(0, 2)}\n\n${lines(2, 2)}\nconst a = 1`)).toBe(0)
    expect(count(`${lines(0, 2)}\nconst a = 1\n${lines(2, 2)}\nconst b = 2`)).toBe(0)
    expect(count(`${lines(0, 2)}\n${lines(2, 2)}\nconst a = 1`)).toBe(1)
  })

  it('does not join a plain comment to an annotation next to it', () => {
    const text = `${lines(0, 2)}\n// eslint-disable-next-line no-console\nconsole.log(1)`
    expect(count(text)).toBe(0)
  })

  it('counts a long run once even when its lines also match a form', () => {
    const block = ['// TODO', '// 二', '// 三 #123'].join('\n')
    expect(comments(`${block}\nconst a = 1`)).toMatchObject({ count: 1, runs: 1, forms: 0 })
  })

  it('counts a file once when its plain comment lines exceed the band', () => {
    expect(comments(scattered(6, 100))).toMatchObject({ count: 0, dense: 0 })
    expect(comments(scattered(7, 100))).toMatchObject({ count: 1, dense: 1, firstLine: 1 })
    expect(comments(scattered(10, 1000))).toMatchObject({ count: 0, dense: 0 })
    expect(comments(scattered(11, 1000))).toMatchObject({ count: 1, dense: 1 })
  })

  it('does not count annotation lines toward the band', () => {
    const text = `${repeat('// eslint-disable-next-line no-console\nconsole.log(1)', 20)}\n`
    expect(count(text)).toBe(0)
  })

  it('does not count a licence header or a typed doc comment in a JavaScript module', () => {
    const licence = '// Copyright (c) 2026 Example\n// SPDX-License-Identifier: MIT\n// 全部保留\n'
    expect(count(`${licence}\nconst a = 1`)).toBe(0)
    const typed =
      '/**\n * @param {string} name\n * @returns {number}\n */\nexport function f(name) {}'
    expect(count(typed, 'tools/a/src/x.mjs')).toBe(0)
    expect(count(typed)).toBe(1)
  })

  it('exempts a file whose bytes are published from the run and the band, with a reason', () => {
    const [path] = [...PUBLISHED_BYTES.keys()]
    if (path === undefined) throw new Error('the list of published files is empty')
    expect(count(`${lines(0, 8)}\nconst a = 1`, path)).toBe(0)
    expect(count(`${lines(0, 8)}\n// TODO\nconst a = 1`, path)).toBe(0)
    expect(count('const a = 1\n\n// TODO\n', path)).toBe(1)
    for (const reason of PUBLISHED_BYTES.values()) expect(reason.length).toBeGreaterThan(0)
  })

  it('reads comments from the syntax, not from text that only looks like one', () => {
    expect(
      count("const url = 'http://x/#123'\nconst re = /\\/\\/ TODO/\nconst t = `// FIXME`"),
    ).toBe(0)
  })

  it('reports the line of the first hit', () => {
    expect(comments('a\n\n// TODO\n// #123').firstLine).toBe(3)
  })

  it('reports only a file whose count exceeds the baseline', () => {
    const sources = [{ path: SOURCE, text: `const a = 1\n// TODO\n// TODO\n\n${lines(0, 3)}\n` }]
    const current = measured({ sources, limits: LIMITS })
    expect(commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 3 } }))).toEqual([])
    expect(commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 4 } }))).toEqual([])
    const [found] = commentViolations(current, emptyBaseline({ comments: { [SOURCE]: 2 } }))
    expect(found).toMatchObject({ rule: 'hygiene-comment-forms', path: SOURCE, line: 2 })
    expect(found?.message).toBe(
      '注释违例 3 条（禁止的形式 2、3 行以上的注释块 1、注释行数超线 0），基线 2 条',
    )
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
