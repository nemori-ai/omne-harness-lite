// @module-tag slow
// Runs the facility's probe and type check in hand-built consumer directories: node and tsc start
// as child processes. Each negative case puts a dependency in an ancestor `node_modules`, outside
// the consumer, and asserts that the check names it. The positive controls keep the same layout
// with the dependency inside the consumer, so a failure cannot come from the layout itself.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { probeEntries, typeCheck, type Check } from './install/consumer.ts'

const memberDirectory = fileURLToPath(new URL('..', import.meta.url))
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-probe-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

type Files = Readonly<Record<string, string>>

/** `<root>/<name>/node_modules` is the ancestor store; the consumer project lies below it. */
function layout(name: string, ancestor: Files, consumer: Files): string {
  const base = join(root, name)
  const write = (directory: string, files: Files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(directory, path, '..'), { recursive: true })
      writeFileSync(join(directory, path), text)
    }
  }
  write(join(base, 'node_modules'), ancestor)
  const project = join(base, 'consumer', 'project')
  mkdirSync(project, { recursive: true })
  write(project, {
    'package.json': '{"name":"consumer","private":true,"type":"module"}',
    ...consumer,
  })
  return project
}

const verdict = (checks: readonly Check[], id: string) => checks.find(check => check.id === id)

const manifest = (fields: object) => JSON.stringify({ version: '1.0.0', ...fields })

describe('probeEntries', () => {
  it('passes a package that stays inside the consumer', () => {
    const project = layout(
      'clean',
      {},
      {
        'node_modules/clean/package.json': manifest({
          name: 'clean',
          type: 'module',
          exports: { '.': { import: './index.js' } },
        }),
        'node_modules/clean/index.js': 'export const value = 1\n',
      },
    )
    const { probe, checks } = probeEntries(project, ['clean'])
    expect(checks.filter(check => !check.ok)).toEqual([])
    expect(probe.map(entry => entry.exports)).toEqual([['value']])
  })

  it('fails when a CommonJS package requires something that only an ancestor node_modules has', () => {
    const project = layout(
      'leak-cjs',
      {
        'ancestor-dep/package.json': manifest({ name: 'ancestor-dep', main: 'index.cjs' }),
        'ancestor-dep/index.cjs': 'module.exports = { from: "ancestor" }\n',
      },
      {
        'node_modules/leaky-cjs/package.json': manifest({ name: 'leaky-cjs', main: 'index.cjs' }),
        'node_modules/leaky-cjs/index.cjs': 'module.exports = require("ancestor-dep")\n',
      },
    )
    const { checks } = probeEntries(project, ['leaky-cjs'])
    expect(verdict(checks, 'probe-run')?.ok).toBe(true)
    const inside = verdict(checks, 'resolution-inside-consumer')
    expect(inside?.ok).toBe(false)
    expect(inside?.detail).toContain(join('node_modules', 'ancestor-dep'))
  })

  it('fails when an ES module imports something that only an ancestor node_modules has', () => {
    const project = layout(
      'leak-esm',
      {
        'ancestor-dep/package.json': manifest({
          name: 'ancestor-dep',
          type: 'module',
          exports: { '.': { import: './index.js' } },
        }),
        'ancestor-dep/index.js': 'export const from = "ancestor"\n',
      },
      {
        'node_modules/leaky-esm/package.json': manifest({
          name: 'leaky-esm',
          type: 'module',
          exports: { '.': { import: './index.js' } },
        }),
        'node_modules/leaky-esm/index.js': 'export { from } from "ancestor-dep"\n',
      },
    )
    const { checks } = probeEntries(project, ['leaky-esm'])
    expect(verdict(checks, 'resolution-inside-consumer')?.ok).toBe(false)
  })

  it('fails when an entry resolves to a src/ path', () => {
    const project = layout(
      'src-path',
      {},
      {
        'node_modules/sourced/package.json': manifest({
          name: 'sourced',
          type: 'module',
          exports: { '.': { import: './src/index.js' } },
        }),
        'node_modules/sourced/src/index.js': 'export const value = 1\n',
      },
    )
    const { checks } = probeEntries(project, ['sourced'])
    expect(verdict(checks, 'resolution-inside-consumer')?.ok).toBe(true)
    const source = verdict(checks, 'resolution-no-source')
    expect(source?.ok).toBe(false)
    expect(source?.detail).toContain(join('sourced', 'src', 'index.js'))
  })

  it('fails the probe run when an entry cannot be imported', () => {
    const project = layout('missing', {}, {})
    expect(verdict(probeEntries(project, ['absent']).checks, 'probe-run')?.ok).toBe(false)
  })
})

describe('typeCheck', () => {
  const typed = (name: string, importFrom?: string) => ({
    [`node_modules/${name}/package.json`]: manifest({
      name,
      type: 'module',
      exports: { '.': { types: './index.d.ts' } },
    }),
    [`node_modules/${name}/index.d.ts`]:
      importFrom === undefined
        ? 'export type Own = number\n'
        : `import type { Dep } from '${importFrom}'\nexport type Own = Dep\n`,
  })
  const dependency = (name: string): Files => ({
    [`${name}/package.json`]: manifest({
      name,
      type: 'module',
      exports: { '.': { types: './index.d.ts' } },
    }),
    [`${name}/index.d.ts`]: 'export type Dep = string\n',
  })

  it('passes declarations that load only consumer and compiler files', () => {
    const project = layout('types-clean', {}, typed('typed-clean'))
    const { files, checks } = typeCheck(project, memberDirectory, ['typed-clean'])
    expect(checks.filter(check => !check.ok)).toEqual([])
    expect(files).toBeGreaterThan(0)
  })

  it('fails when a declaration reaches a type that only an ancestor node_modules has', () => {
    const project = layout(
      'types-leak',
      dependency('ancestor-types'),
      typed('typed-leak', 'ancestor-types'),
    )
    const { checks } = typeCheck(project, memberDirectory, ['typed-leak'])
    expect(verdict(checks, 'type-check')?.ok).toBe(true)
    const stray = verdict(checks, 'type-resolution-inside-consumer')
    expect(stray?.ok).toBe(false)
    expect(stray?.detail).toContain(join('ancestor-types', 'index.d.ts'))
  })

  it('passes the same declaration when the dependency is inside the consumer', () => {
    const inner = Object.fromEntries(
      Object.entries(dependency('inner-types')).map(([path, text]) => [
        `node_modules/${path}`,
        text,
      ]),
    )
    const project = layout('types-inner', {}, { ...typed('typed-inner', 'inner-types'), ...inner })
    const { checks } = typeCheck(project, memberDirectory, ['typed-inner'])
    expect(checks.filter(check => !check.ok)).toEqual([])
  })

  it('fails the type check when an entry has no declarations', () => {
    const project = layout('types-missing', {}, {})
    expect(verdict(typeCheck(project, memberDirectory, ['absent']).checks, 'type-check')?.ok).toBe(
      false,
    )
  })
})
