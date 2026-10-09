// @module-tag slow
// Actual Git sources exercise metadata changes, unknowns and version-local fact identity.
import { afterEach, describe, expect, it } from 'vitest'
import { renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { CONSTRAINT_PATH } from '../src/arch/constraints.ts'
import { readArchitectureSensors } from '../src/loop/sensors/conformance.ts'
import { observeAssembly } from '../src/loop/sensors/assembly.ts'
import { extractArchitecture } from '../src/arch/extract.ts'
import { snapshotOf } from './architecture-snapshot.ts'
import { commit, removeTemporaries, repository, write } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)
const member = 'packages/core/example'
const source = `${member}/src/plugin.ts`
const prefix = "import {Context,Service} from '@deepseek-ai/cordis';\n"
function workspace(text: string) {
  const root = repository()
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
  write(
    root,
    `${member}/package.json`,
    JSON.stringify({ name: '@example/example', exports: { '.': './dist/index.js' } }),
  )
  write(
    root,
    CONSTRAINT_PATH,
    JSON.stringify({ schemaVersion: 1, domains: [], roles: [], rules: [] }),
  )
  write(root, source, prefix + text)
  return { root, base: commit(root, 'original sources') }
}
function read(root: string, base?: string) {
  const readings = readArchitectureSensors(root, { enabled: true }, base)
  expect(readings.architecture.status).toBe('data')
  expect(readings.assemblyDelta.status).toBe(base === undefined ? 'no-data' : 'data')
  if (readings.architecture.status !== 'data') throw Error('actual observations unavailable')
  return readings.architecture.data
}
describe('actual assembly observations', { timeout: 60_000 }, () => {
  it('retains additions and removals without a manual node declaration', () => {
    const { root, base } = workspace(
      "export const p={name:'p',apply(ctx:Context){ctx.provide('svc',{})}}",
    )
    write(
      root,
      source,
      prefix + "export const p={name:'p',inject:['newDependency'],apply(ctx:Context){}}",
    )
    const result = read(root, base)
    expect(result.delta).toMatchObject({
      status: 'data',
      data: {
        added: expect.arrayContaining([
          expect.objectContaining({ kind: 'injects', key: 'newDependency' }),
        ]),
        removed: expect.arrayContaining([
          expect.objectContaining({ kind: 'provides', key: 'svc' }),
        ]),
      },
    })
  })
  it('retains contract and owner changes under the same service identity', () => {
    const before =
      "/** @contract capability.before\n * @owner packages/core/before */\nexport abstract class Base extends Service {static provide='svc'}"
    const { root, base } = workspace(before)
    write(
      root,
      source,
      prefix +
        before
          .replace('capability.before', 'capability.after')
          .replace('core/before', 'core/after'),
    )
    const result = read(root, base)
    expect(result.delta).toMatchObject({
      status: 'data',
      data: {
        added: [],
        removed: [],
        changed: expect.arrayContaining([
          {
            before: expect.arrayContaining([
              expect.objectContaining({
                key: 'svc',
                contract: 'capability.before',
                owner: 'packages/core/before',
              }),
            ]),
            after: expect.arrayContaining([
              expect.objectContaining({
                key: 'svc',
                contract: 'capability.after',
                owner: 'packages/core/after',
              }),
            ]),
          },
        ]),
      },
    })
  })
  it('ignores line and file moves but preserves the new source location', () => {
    const text = "export const p={name:'p',inject:['storage'],apply(ctx:Context){}}"
    const { root, base } = workspace(text)
    write(root, source, '\n\n' + prefix + text)
    renameSync(join(root, source), join(root, `${member}/src/moved.ts`))
    expect(read(root, base).delta).toEqual({
      status: 'data',
      data: { added: [], removed: [], changed: [] },
    })
    expect(read(root, base).facts.find(f => f.kind === 'injects')).toMatchObject({
      path: `${member}/src/moved.ts`,
      line: 4,
    })
  })
  it('records dynamic injection as unknown, not runtime dependency release', () => {
    const { root, base } = workspace(
      "export const p={name:'p',inject:['storage'],apply(ctx:Context){}}",
    )
    write(
      root,
      source,
      prefix + "export const p={name:'p',inject:dependencies(),apply(ctx:Context){}}",
    )
    const result = read(root, base)
    expect(result.delta).toMatchObject({
      status: 'data',
      data: {
        removed: expect.arrayContaining([
          expect.objectContaining({ key: 'storage', kind: 'injects' }),
        ]),
      },
    })
    expect(result.current.unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'injects', expression: 'dependencies()' }),
      ]),
    )
  })
  it('does not collapse delimiter names or conflicting metadata in occurrences', () => {
    const text =
      prefix +
      "function register(ctx:Context,key:string){ctx.provide(key,{})} export const a={name:'p|top|provides|x',apply(ctx:Context){register(ctx,'y')}};export const b={name:'p',apply(ctx:Context){register(ctx,'x|top|provides|y')}}"
    const extracted = extractArchitecture(
      snapshotOf(
        new Map([
          [`${member}/package.json`, '{"name":"@example/example"}'],
          [source, text],
        ]),
      ),
    )
    const providers = observeAssembly(extracted).facts.filter(f => f.kind === 'provides')
    expect(providers.map(f => f.key).sort()).toEqual(['x|top|provides|y', 'y'])
    const original = providers[0]
    if (original === undefined) throw Error('missing source fact')
    const baseline = {
      ...extracted,
      factOccurrences: [
        { ...original, contract: 'A' },
        { ...original, contract: 'A' },
      ],
    }
    const current = {
      ...extracted,
      factOccurrences: [
        { ...original, contract: 'A' },
        { ...original, contract: 'B' },
      ],
    }
    const result = observeAssembly(current, baseline)
    expect(result.facts).toHaveLength(2)
    expect(result.delta).toMatchObject({
      status: 'data',
      data: {
        added: [],
        removed: [],
        changed: [
          {
            before: [{ contract: 'A' }],
            after: expect.arrayContaining([
              { ...original, contract: 'A' },
              { ...original, contract: 'B' },
            ]),
          },
        ],
      },
    })
  })
  it('missing workspace input is no-data without inventing an empty comparison', () => {
    const { root } = workspace("export const p={name:'p',apply(){}}")
    rmSync(join(root, 'pnpm-workspace.yaml'))
    const result = readArchitectureSensors(root, { enabled: true })
    for (const reading of Object.values(result))
      expect(reading).toEqual({
        status: 'no-data',
        reason: '当前源码缺 pnpm-workspace.yaml，无法解析实际 workspace',
      })
    const bare = repository()
    write(bare, 'README.md', 'no workspace input\n')
    const base = commit(bare, 'no workspace')
    write(bare, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    const againstBare = readArchitectureSensors(bare, { enabled: true }, base)
    expect(againstBare.assemblyDelta).toEqual({
      status: 'no-data',
      reason: 'BASE 源码缺 pnpm-workspace.yaml，不能借 HEAD 配置补齐',
    })
  })
  it('validates a present illegal HEAD before reporting a missing BASE workspace', () => {
    const root = repository()
    write(root, 'README.md', 'bare base\n')
    const base = commit(root, 'without workspace')
    write(root, 'pnpm-workspace.yaml', 'packages: [')
    expect(() => readArchitectureSensors(root, { enabled: true }, base)).toThrow(
      'pnpm-workspace.yaml 里没有 packages: 列表',
    )
  })
  it('validates a present illegal BASE before reporting a missing HEAD workspace', () => {
    const root = repository()
    write(root, 'pnpm-workspace.yaml', 'packages: [')
    const base = commit(root, 'illegal workspace')
    rmSync(join(root, 'pnpm-workspace.yaml'))
    expect(() => readArchitectureSensors(root, { enabled: true }, base)).toThrow(
      'pnpm-workspace.yaml 里没有 packages: 列表',
    )
  })
  it('invalid BASE is a revision error, not absent workspace input', () => {
    const { root } = workspace("export const p={name:'p',apply(){}}")
    expect(() => readArchitectureSensors(root, { enabled: true }, 'not-a-real-revision')).toThrow(
      'Command failed',
    )
  })
  it('no baseline and disabled readings are absent, not zero', () => {
    const { root } = workspace("export const p={name:'p',apply(){}}")
    expect(read(root).delta).toEqual({ status: 'no-data', reason: '没给基线' })
    const readings = readArchitectureSensors(root, { enabled: false })
    for (const value of Object.values(readings))
      expect(value).toEqual({ status: 'no-data', reason: '配置里关了' })
  })
})
