// Source rules of the conformance suites. The answers of an operation are read through the
// two primitives of testing-case.ts, so a suite polls nowhere: the only waits that remain are the
// ones that a fixture gives a deadline (`within`, the quiet periods of `drain` and of the clock),
// and a legal provider of the self-proof is built at the port boundary, never through the controls
// of a double.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { controlReads, inlineLegalProviders } from './legal-source-rule.ts'
import { memberPath } from './module-graph.ts'

const sourceDir = memberPath('src')
const testsDir = memberPath('tests')

const suiteModules = readdirSync(sourceDir)
  .filter(name => /^testing(-[a-z-]+)?\.ts$/u.test(name))
  .map(name => join(sourceDir, name))

/** The identifiers that name a deadline or a quiet period that a fixture provides. */
const FIXTURE_DEADLINES = ['quietMs', 'milliseconds', 'waitMs', 'readDeadlineMs']

describe('the suite modules read answers without polling', () => {
  it('finds the suite modules', () => {
    expect(suiteModules.length).toBeGreaterThanOrEqual(10)
  })

  it.each(suiteModules)('has no askUntil, no interval and no round loop in %s', file => {
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(/askUntil/u)
    expect(text).not.toMatch(/setInterval/u)
    expect(text).not.toMatch(/setImmediate/u)
    expect(text).not.toMatch(/round\s*<\s*\d+/u)
  })

  it.each(suiteModules)('waits only for a deadline of the fixture in %s', file => {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (!line.includes('setTimeout(')) return
      // The deadline is the last argument: on this line or within the next few lines.
      const window = lines.slice(index, index + 6).join('\n')
      expect(
        FIXTURE_DEADLINES.some(name => window.includes(name)),
        `${file}:${index + 1} waits for a time that no fixture gave`,
      ).toBe(true)
    })
  })

  it('has no polling QUIET_MS constant: the quiet period is a member of the fixture', () => {
    for (const file of suiteModules) expect(readFileSync(file, 'utf8')).not.toMatch(/\bQUIET_MS\b/u)
  })
})

describe('a legal provider of the self-proof is built at the port boundary', () => {
  const specs = readdirSync(testsDir)
    .filter(name => name.endsWith('-conformance.spec.ts'))
    .map(name => join(testsDir, name))
  /** The files that build legal providers: every legal row of a spec takes its provider from one. */
  const legalFiles = [
    ...readdirSync(testsDir).filter(name => name.endsWith('-legal.ts')),
    'generated-provider.ts',
  ].map(name => join(testsDir, name))

  it('finds the files that build legal providers, one or more for each suite', () => {
    expect(legalFiles.length).toBeGreaterThanOrEqual(specs.length)
  })

  it.each(legalFiles)('names no control of a double in %s', file => {
    expect(controlReads(file, readFileSync(file, 'utf8'))).toEqual([])
  })

  it.each(specs)('takes every legal provider of %s from a legal file', file => {
    expect(inlineLegalProviders(file, readFileSync(file, 'utf8'))).toEqual([])
  })

  it('has no spec that reaches the controls of a double but the case that doubles share no state', () => {
    for (const file of specs) {
      const uses = readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => /\.controls\b/u.test(line))
      expect(uses.length, file).toBeLessThanOrEqual(
        file.endsWith('environment-conformance.spec.ts') ? 2 : 0,
      )
    }
  })

  it('has a generated provider that imports no double', () => {
    const text = readFileSync(join(testsDir, 'generated-provider.ts'), 'utf8')
    expect(text).not.toMatch(/createMemory|memoryTool|controls/u)
  })
})

describe('the source rule of the legal providers', () => {
  // The spellings that a text match on `(base|real|fixture).<control>` lets through, the others
  // that name a control, and the imports through which a helper of a test module reaches one.
  const bypasses: readonly (readonly [string, string])[] = [
    ['a destructuring', 'const double = make(); const { hold } = double; hold?.()'],
    ['a destructuring under another name', 'const { rejectNext: next } = make(); next("x")'],
    ['an alias', 'const alias = make(); alias.excludeDeferred'],
    ['an optional call', 'const start = () => base.holdStop?.(input.start)'],
    ['a string index', "const double = make(); double['failNext']()"],
    ['a name held in a string', "const key = 'dropNextAnswer'; double[key]()"],
    ['a template index', 'double[`blindInspection`](start)'],
    ['the controls of a double', 'const { controls } = make(); controls.hold()'],
    [
      'a helper imported from a test module that is not legal',
      "import { nudge } from './tool-values.ts'\nconst double = make(); nudge(double)",
    ],
    [
      'a name imported from a test module that is not legal',
      "import { DOUBLE_CONTROLS } from './legal-source-rule.ts'\nReflect.get(make(), DOUBLE_CONTROLS[1])()",
    ],
    [
      'a whole test module imported',
      "import * as values from './tool-values.ts'\nvalues.nudge(make())",
    ],
  ]

  it.each(bypasses)('rejects %s in a legal file', (_name, text) => {
    expect(controlReads('bypass-legal.ts', text)).not.toEqual([])
  })

  it('lets a legal provider define its own handles and read the handles of the fixture', () => {
    const text = [
      'const excludeDeferred = (record: unknown) => Promise.resolve()',
      'const settle = async () => { await base.settle?.() }',
      'return { ...base, hold: () => undefined, settle, excludeDeferred }',
    ].join('\n')
    expect(controlReads('own-legal.ts', text)).toEqual([])
  })

  it('lets a legal file import from legal modules, packages, types and the allowed values', () => {
    const text = [
      "import { succeed } from '@omne-harness/operation-result'",
      "import { createMask } from './generated-provider.ts'",
      "import { externalGenerated } from './external-association-legal.ts'",
      "import { evidence, type Values } from './tool-values.ts'",
      "import type { Variant } from './conformance-harness.ts'",
      "import { keep, later, turns } from './conformance-harness.ts'",
    ].join('\n')
    expect(controlReads('imports-legal.ts', text)).toEqual([])
  })

  const spec = (row: string): string =>
    [
      "import { generated, oneTenant } from './suite-legal.ts'",
      "import { memoryToolFixture } from '@omne-harness/tool-contract/testing'",
      'const local = () => memoryToolFixture()',
      `const legal = [${row}]`,
      'itPassesLegal(cases, legal)',
    ].join('\n')

  it.each([
    // A row whose provider is written in the spec itself.
    [
      'a provider written in the row',
      "{ name: 'p', fixture: () => { const base = memoryToolFixture(); return base } }",
    ],
    ['a builder of the spec', "{ name: 'p', fixture: local }"],
    ['a legal builder given a function of the spec', "{ name: 'p', fixture: generated(local) }"],
    ['a legal builder given a function', "{ name: 'p', fixture: generated(() => local()) }"],
    ['a spread of a table of the spec', "...[{ name: 'p', fixture: local }]"],
    ['a row that a function of the spec returns', 'local()'],
    ['a spread of the rows that a function of the spec returns', '...local()'],
  ])('rejects %s in a legal table of a spec', (_name, row) => {
    expect(inlineLegalProviders('suite-conformance.spec.ts', spec(row))).not.toEqual([])
  })

  it('rejects a legal table that a function of the spec returns', () => {
    const text = [
      "import { generated } from './suite-legal.ts'",
      "function rows() { return [{ name: 'p', fixture: generated('pending') }] }",
      'itPassesLegal(cases, rows())',
    ].join('\n')
    expect(inlineLegalProviders('suite-conformance.spec.ts', text)).not.toEqual([])
  })

  it('accepts the rows that take their provider from a legal file', () => {
    const rows = [
      "{ name: 'a', fixture: oneTenant }",
      "{ name: 'b', fixture: generated('unknown', { settle: false }) }",
      "...['pending'].map(kind => ({ name: kind, fixture: generated(kind) }))",
    ].join(', ')
    expect(inlineLegalProviders('suite-conformance.spec.ts', spec(rows))).toEqual([])
  })
})
