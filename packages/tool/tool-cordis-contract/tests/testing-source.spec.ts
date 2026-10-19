// Source rule of the registration suite: it polls nowhere. The one wait that remains is the
// quiet period that the fixture names (`quietMs`), and a legal provider of the self-proof is built
// at the boundary of the register service, never through a flaw or a control of a double.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { controlReads, inlineLegalProviders } from './legal-source-rule.ts'
import { memberPath, specifiersOf } from './module-graph.ts'

const source = readFileSync(memberPath('src/testing.ts'), 'utf8')
const testsDir = memberPath('tests')
const specs = readdirSync(testsDir)
  .filter(name => name.endsWith('-conformance.spec.ts'))
  .map(name => join(testsDir, name))
const legalFiles = readdirSync(testsDir)
  .filter(name => name.endsWith('-legal.ts'))
  .map(name => join(testsDir, name))

it('has no polling and no timer other than the quiet period of the fixture', () => {
  expect(source).not.toMatch(/askUntil|setInterval|setImmediate|round\s*<\s*\d+/u)
  const timers = source.split('\n').filter(line => line.includes('setTimeout('))
  expect(timers).toHaveLength(1)
  expect(timers[0]).toContain('quietMs')
})

it('has no spec that reaches the controls of a double', () => {
  for (const file of specs) expect(readFileSync(file, 'utf8')).not.toMatch(/\.controls\b/u)
})

it('finds a legal file for each suite', () => {
  expect(legalFiles.length).toBeGreaterThanOrEqual(specs.length)
})

it.each(legalFiles)('builds the legal providers of %s without a flaw or a control', file => {
  const text = readFileSync(file, 'utf8')
  expect(controlReads(file, text)).toEqual([])
  expect(specifiersOf(text).filter(specifier => specifier.includes('flawed'))).toEqual([])
})

it.each(specs)('takes every legal provider of %s from a legal file', file => {
  expect(inlineLegalProviders(file, readFileSync(file, 'utf8'))).toEqual([])
})

it('rejects a legal row whose provider the spec writes itself', () => {
  const spec = [
    "import { generated } from './registration-legal.ts'",
    "import { flawedFixture } from './flawed-registrations.ts'",
    'const legal = [',
    "  { name: 'a', fixture: generated },",
    "  { name: 'b', fixture: () => flawedFixture({ emptyToken: true }) },",
    ']',
    'itPassesLegal(cases, legal)',
  ].join('\n')
  expect(inlineLegalProviders('registration-conformance.spec.ts', spec)).toHaveLength(1)
})
