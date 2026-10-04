// @module-tag slow
// Real Git commits exercise both version-local resolution and baseline intent protection.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readConformance } from '../src/arch/conformance.ts'
import { parseConstraints, CONSTRAINT_PATH } from '../src/arch/constraints.ts'
import { RULE_IDS, type ArchitectureConstraints } from '../src/arch/conformance-model.ts'
import { readActualArchitecture } from '../src/arch/actual.ts'
import { findingsOf } from '../src/loop/hook.ts'
import { measureForHook, touchedBase } from '../src/loop/hook-measure.ts'
import { readLoopConfig } from '../src/loop/config.ts'
import { readMetricsConfig } from '../src/metrics/config.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'
import type { Storage } from '../../../packages/core/storage/src/index.ts'

afterEach(removeTemporaries)
const ui = 'apps/ui',
  storage = 'packages/core/storage',
  sql = 'packages/infra/sql',
  policy = 'packages/domain/policy'
function setup(): { root: string; intent: ArchitectureConstraints; base: string } {
  const root = repository()
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - apps/*\n')
  for (const [member, name] of [
    [ui, 'ui'],
    [storage, 'storage'],
    [sql, 'sql'],
    [policy, 'policy'],
  ]) {
    write(
      root,
      `${member}/package.json`,
      JSON.stringify({ name: `@example/${name}`, exports: { '.': './dist/index.js' } }),
    )
    write(root, `${member}/src/index.ts`, 'export const value = 1')
  }
  write(root, `${ui}/src/view.ts`, 'export const view = 1')
  write(
    root,
    `${ui}/src/compose.ts`,
    "import {value} from '@example/sql'; export const boot = value",
  )
  const intent: ArchitectureConstraints = {
    schemaVersion: 1,
    domains: [{ id: 'business', label: '业务', source: 'accepted.md' }],
    roles: [
      {
        id: 'ui',
        paths: [`${ui}/src/view.ts`],
        layer: 'interaction',
        domains: ['business'],
        status: 'adopted',
        source: 'accepted.md#ui',
      },
      {
        id: 'composition',
        paths: [`${ui}/src/compose.ts`],
        layer: 'assembly',
        domains: ['business'],
        status: 'adopted',
        source: 'accepted.md#compose',
      },
      {
        id: 'port',
        paths: [`${storage}/src/**`],
        layer: 'storage-port',
        domains: [],
        status: 'adopted',
        source: 'accepted.md#port',
      },
      {
        id: 'adapter',
        paths: [`${sql}/src/**`],
        layer: 'storage-adapter',
        domains: [],
        status: 'adopted',
        source: 'accepted.md#adapter',
      },
      {
        id: 'policy',
        paths: [`${policy}/src/**`],
        layer: 'policy',
        domains: ['business'],
        status: 'adopted',
        source: 'accepted.md#policy',
      },
    ],
    rules: RULE_IDS.map(id => ({ id, source: 'accepted.md#rules' })),
  }
  write(root, CONSTRAINT_PATH, JSON.stringify(intent))
  return { root, intent, base: commit(root, 'accepted expectations') }
}
describe('global architecture conformance', () => {
  it('separates interaction bypass, DIP, legitimate assembly and unmapped entrances inside one member', () => {
    const { root, base } = setup()
    write(
      root,
      `${ui}/src/view.ts`,
      "import type {value} from '@example/storage'; export type Data = typeof value",
    )
    write(
      root,
      `${ui}/src/unassigned.ts`,
      "import {value} from '@example/sql'; export const x = value",
    )
    write(
      root,
      `${policy}/src/index.ts`,
      "import {value} from '@example/sql'; export const x = value",
    )
    const rows = readConformance({ root, base }).rows
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'LAYER-ENTRY',
          state: 'deviation',
          age: 'new',
          member: ui,
        }),
        expect.objectContaining({
          rule: 'LAYER-DIP',
          state: 'converged',
          relation: expect.objectContaining({ path: `${ui}/src/view.ts` }),
        }),
        expect.objectContaining({
          rule: 'IC-5',
          state: 'converged',
          relation: expect.objectContaining({ path: `${ui}/src/compose.ts` }),
        }),
        expect.objectContaining({
          rule: 'IC-5',
          state: 'unknown',
          relation: expect.objectContaining({ path: `${ui}/src/unassigned.ts` }),
        }),
        expect.objectContaining({
          rule: 'LAYER-DIP',
          state: 'deviation',
          age: 'new',
          member: policy,
        }),
      ]),
    )
    expect(
      rows.some(row => row.state === 'deviation' && row.relation?.path === `${ui}/src/compose.ts`),
    ).toBe(false)
  })
  it('a real code-plus-relaxed-intent commit reports both facts against the baseline', () => {
    const { root, base, intent } = setup()
    write(
      root,
      `${ui}/src/view.ts`,
      "import {value} from '@example/storage'; export const view = value",
    )
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({ ...intent, rules: intent.rules.filter(r => r.id !== 'LAYER-ENTRY') }),
    )
    const head = commit(root, 'code and intent changed together')
    const result = readConformance({ root, revision: head, base, member: ui })
    expect(result.rows.some(row => row.rule === 'LAYER-ENTRY' && row.age === 'new')).toBe(true)
    expect(result.changes.map(c => c.path)).toContain(CONSTRAINT_PATH)
    expect(result.current.source.kind).toBe('revision')
    expect(result.baseline?.source.commit).toBe(base)
    expect(
      findingsOf({ ...measureForHook(root, base, readLoopConfig(), readMetricsConfig()) }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('新增架构偏离 · LAYER-ENTRY') }),
        expect.objectContaining({ text: expect.stringContaining('架构预期改动') }),
      ]),
    )
  })
  it('last-rule removal, entire owner removal and intent-only changes remain observable', () => {
    const { root, base, intent } = setup()
    write(root, CONSTRAINT_PATH, JSON.stringify({ ...intent, rules: [] }))
    expect(touchedBase(root, 'main')).toBe(base)
    expect(readConformance({ root, base }).changes).toHaveLength(1)
    rmSync(join(root, CONSTRAINT_PATH))
    const deleted = readConformance({ root, base })
    expect(deleted.changes[0]?.after).toBeNull()
    expect(deleted.comparedWith).toBe('baseline')
  })
  it('formatting, object order, set order and source line moves do not create false semantic changes', () => {
    const { root, base, intent } = setup()
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify(
        {
          rules: [...intent.rules].reverse(),
          roles: [...intent.roles].reverse(),
          domains: intent.domains,
          schemaVersion: 1,
        },
        null,
        4,
      ),
    )
    write(
      root,
      `${ui}/src/compose.ts`,
      "\n\nimport {value} from '@example/sql'; export const boot = value",
    )
    expect(readConformance({ root, base }).changes).toEqual([])
    expect(readConformance({ root, base }).rows.filter(row => row.age === 'new')).toEqual([])
  })
  it('same-member same-symbol new entrance does not inherit an old violation identity', () => {
    const { root, intent } = setup()
    write(
      root,
      `${ui}/src/view.ts`,
      "import {value} from '@example/storage'; export const view = value",
    )
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({
        ...intent,
        roles: intent.roles.map(r =>
          r.id === 'ui' ? { ...r, paths: [`${ui}/src/view.ts`, `${ui}/src/second.ts`] } : r,
        ),
      }),
    )
    const base = commit(root, 'stock violation')
    write(
      root,
      `${ui}/src/second.ts`,
      "import {value} from '@example/storage'; export const second = value",
    )
    const violations = readConformance({ root, base }).rows.filter(
      row => row.rule === 'LAYER-ENTRY' && row.state === 'deviation',
    )
    expect(violations.map(row => row.age).sort()).toEqual(['new', 'stock'])
    expect(new Set(violations.map(row => row.id)).size).toBe(2)
  })
  it('member projection keeps baseline aliases and full resolver context', () => {
    const { root } = setup()
    // The root config is allowed to change between versions; neither resolver uses HEAD for BASE.
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@data': [`${storage}/src/index.ts`] } },
      }),
    )
    write(root, `${ui}/src/view.ts`, "import {value} from '@data'; export const view = value")
    const base = commit(root, 'baseline alias resolves storage port')
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@data': [`${sql}/src/index.ts`] } },
      }),
    )
    const result = readConformance({ root, base, member: ui })
    expect(
      result.rows.find(row => row.rule === 'LAYER-ENTRY' && row.age === 'new')?.relation
        ?.resolvedPath,
    ).toBe(`${sql}/src/index.ts`)
    expect(result.rows.every(row => row.member === ui || row.targetMember === ui)).toBe(true)
  })
  it('IC-3/4 report declarations and root closure, without asserting runtime or LSP', () => {
    const { root, base } = setup()
    write(root, `${policy}/src/index.ts`, "export * from './plugin.js'")
    write(
      root,
      `${policy}/src/plugin.ts`,
      "import type {Context} from '@deepseek-ai/cordis'; declare module '@deepseek-ai/cordis' { interface Context { custom: {} } }; export function use(ctx: Context) { return ctx }",
    )
    const result = readConformance({ root, base })
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'IC-3', state: 'deviation', member: policy }),
        expect.objectContaining({ rule: 'IC-4', state: 'deviation', member: policy }),
      ]),
    )
    expect(result.coverage.find(row => row.id === 'LSP')).toMatchObject({
      evidence: 'behavior',
      scope: expect.stringContaining('未执行'),
    })
    const actual = readActualArchitecture({ root })
    expect('conformance' in actual).toBe(false)
    git(root, 'status', '--short')
  })
  it('IC-1/2/3 distinguish a core Service declaration from duplicate declarations and direct provide', () => {
    const { root, base } = setup()
    write(
      root,
      `${storage}/src/cordis.ts`,
      `import {Service} from '@deepseek-ai/cordis'
/** @contract accepted.storage */
export class Data extends Service { static provide = 'data' }
`,
    )
    let rows = readConformance({ root, base }).rows
    for (const rule of ['IC-1', 'IC-2', 'IC-3'])
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule, state: 'converged', member: storage }),
        ]),
      )
    expect(
      rows.some(row => row.rule === 'IC-4' && row.member === storage && row.state === 'deviation'),
    ).toBe(false)
    write(
      root,
      `${policy}/src/duplicate.ts`,
      `import {Service, Context} from '@deepseek-ai/cordis'
export class Duplicate extends Service { static provide = 'data' }
export function old(ctx: Context) { ctx.provide('direct', {}) }
`,
    )
    rows = readConformance({ root, base }).rows
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'IC-1', state: 'deviation', member: storage }),
        expect.objectContaining({ rule: 'IC-1', state: 'deviation', member: policy }),
        expect.objectContaining({ rule: 'IC-2', state: 'deviation', key: 'direct' }),
        expect.objectContaining({ rule: 'IC-3', state: 'deviation', member: policy }),
      ]),
    )
  })
  it('pairs typed Context augmentation with its exact Service, retaining mismatches and duplicates', () => {
    const { root, base } = setup()
    write(
      root,
      `${storage}/src/cordis.ts`,
      `import {Service} from '@deepseek-ai/cordis'
/** @contract accepted.storage */
export abstract class Data extends Service { static readonly provide = 'data' }
export abstract class Untagged extends Service { static readonly provide = 'untagged' }
declare module '@deepseek-ai/cordis' {
  interface Context { data: Data; wrongKey: Data; untyped: {}; untagged: Untagged }
}
`,
    )
    let rows = readConformance({ root, base }).rows
    for (const rule of ['IC-1', 'IC-3']) {
      const data = rows.filter(row => row.rule === rule && row.key === 'data')
      expect(data).toHaveLength(2)
      expect(data.every(row => row.state === 'converged')).toBe(true)
    }
    for (const key of ['wrongKey', 'untyped', 'untagged'])
      expect(
        rows.some(row => row.rule === 'IC-3' && row.key === key && row.state === 'deviation'),
      ).toBe(true)
    write(
      root,
      `${policy}/src/duplicate.ts`,
      `import {Service} from '@deepseek-ai/cordis'
/** @contract accepted.storage */
export abstract class Duplicate extends Service { static readonly provide = 'data' }
`,
    )
    rows = readConformance({ root, base }).rows
    expect(rows.filter(row => row.rule === 'IC-1' && row.key === 'data')).toHaveLength(3)
    expect(
      rows
        .filter(row => row.rule === 'IC-1' && row.key === 'data')
        .every(row => row.state === 'deviation'),
    ).toBe(true)
  })
  it.each([
    {
      declaration:
        "/** @contract accepted.storage */\nexport abstract class A extends Service { static readonly provide = 'data' } export abstract class B extends Service { static readonly provide = 'data' }",
      type: 'B',
    },
    {
      declaration:
        "export namespace A { /** @contract accepted.storage */\nexport abstract class Data extends Service { static readonly provide = 'data' } } export namespace B { export abstract class Data extends Service { static readonly provide = 'data' } }",
      type: 'B.Data',
    },
  ])(
    'does not borrow class metadata from a same-line definition ($type)',
    ({ declaration, type }) => {
      const { root, base } = setup()
      write(
        root,
        `${storage}/src/cordis.ts`,
        `import {Service} from '@deepseek-ai/cordis'
${declaration}
declare module '@deepseek-ai/cordis' { interface Context { data: ${type} } }
`,
      )
      const rows = readConformance({ root, base }).rows
      expect(
        rows.filter(row => row.rule === 'IC-3' && row.key === 'data' && row.state === 'deviation'),
      ).toHaveLength(2)
      expect(
        rows
          .filter(row => row.rule === 'IC-1' && row.key === 'data')
          .every(row => row.state === 'deviation'),
      ).toBe(true)
    },
  )
  it('BASE exact-symbol IC-5 exceptions remain scoped and a layer conflict stays pending', () => {
    const { root } = setup()
    const declaration = `.meta_harness/design/realization/${ui}/bindings.yaml`
    write(root, `.meta_harness/design/realization/${sql}/bindings.yaml`, '{}')
    write(
      root,
      declaration,
      `assembly:
  plugins: []
  importExceptions:
    - target: ${sql}
      symbols: [value]
      sharedStorage: accepted-row
      source: design.md#same-commit
`,
    )
    const base = commit(root, 'accepted exact-symbol exception')
    write(
      root,
      `${ui}/src/view.ts`,
      "import {value, unsafe} from '@example/sql'; export const view = value",
    )
    // HEAD tries to extend the accepted exception. The new symbol must still be red.
    write(
      root,
      declaration,
      `assembly:
  plugins: []
  importExceptions:
    - target: ${sql}
      symbols: [value, unsafe]
      sharedStorage: accepted-row
      source: design.md#same-commit
`,
    )
    const result = readConformance({ root, base })
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-5',
          state: 'converged',
          key: '@example/sql#value',
          reason: expect.stringContaining('accepted-row'),
        }),
        expect.objectContaining({
          rule: 'LAYER-ENTRY',
          state: 'unknown',
          key: '@example/sql#value',
          reason: expect.stringContaining('待裁定'),
        }),
        expect.objectContaining({
          rule: 'IC-5',
          state: 'deviation',
          age: 'new',
          key: '@example/sql#unsafe',
        }),
      ]),
    )
    expect(result.changes.map(change => change.path)).toContain(declaration)
  })
  it('incoming member projection and an unknown member preserve the full comparison', () => {
    const { root, base } = setup()
    write(
      root,
      `${ui}/src/view.ts`,
      "import {value} from '@example/storage'; export const view = value",
    )
    const incoming = readConformance({ root, base, member: storage })
    expect(incoming.projection).toEqual({ member: storage, matched: true })
    expect(incoming.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          member: ui,
          targetMember: storage,
          rule: 'LAYER-ENTRY',
          age: 'new',
        }),
      ]),
    )
    const unknown = readConformance({ root, base, member: 'apps/missing' })
    expect(unknown.projection).toEqual({ member: 'apps/missing', matched: false })
    expect(unknown.rows).toEqual([])
    expect(unknown.baseline).toEqual(incoming.baseline)
  })
  it('the global owner does not silence the original node declaration hook sensor', () => {
    const { root } = setup()
    write(
      root,
      `.meta_harness/design/realization/${policy}/bindings.yaml`,
      'assembly: {plugins: [{name: p, source: "design.md#p"}]}',
    )
    const base = commit(root, 'original node declaration remains active')
    write(
      root,
      `${policy}/src/plugin.ts`,
      `import {Context} from '@deepseek-ai/cordis'
export const p = { name: 'p', inject: ['newDependency'], apply(ctx:Context) { ctx.get('newDependency') } }
`,
    )
    const readings = measureForHook(root, base, readLoopConfig(), readMetricsConfig())
    expect(readings.explain.newDeviations).toMatchObject({
      status: 'data',
      data: expect.arrayContaining([
        expect.objectContaining({ key: 'newDependency', state: 'deviation' }),
      ]),
    })
    expect(findingsOf(readings).some(finding => finding.text.includes('newDependency'))).toBe(true)
  })
  it('no BASE uses current expectations, while a BASE without the owner never substitutes HEAD rules', () => {
    const { root, intent } = setup()
    rmSync(join(root, CONSTRAINT_PATH))
    const base = commit(root, 'no global owner yet')
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    write(
      root,
      `${ui}/src/view.ts`,
      "import {value} from '@example/storage'; export const view = value",
    )
    expect(readConformance({ root }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'LAYER-ENTRY', state: 'deviation', age: 'unjudged' }),
      ]),
    )
    const compared = readConformance({ root, base })
    expect(compared.baseline?.value).toBeNull()
    expect(compared.rows.every(row => row.rule === 'ROLE')).toBe(true)
    expect(compared.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'global-architecture', before: null }),
      ]),
    )
  })
  it('bad JSON, unknown rule, duplicated IDs and unsafe paths fail rather than pass', () => {
    const { intent } = setup()
    for (const value of [
      { ...intent, rules: [{ id: 'invented', source: 'x' }] },
      { ...intent, roles: [...intent.roles, intent.roles[0]] },
      { ...intent, roles: [{ ...intent.roles[0], paths: ['../outside'] }] },
    ])
      expect(() => parseConstraints(JSON.stringify(value))).toThrow()
  })
  it('an unresolved dynamic import remains an explicit unknown outside any public root closure', () => {
    const { root, base } = setup()
    write(root, `${ui}/src/unassigned.ts`, 'export const load = (key:string) => import(key)')
    expect(readConformance({ root, base }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'ROLE',
          state: 'unknown',
          key: 'key',
          sites: expect.arrayContaining([
            expect.objectContaining({ path: `${ui}/src/unassigned.ts` }),
          ]),
        }),
      ]),
    )
  })
  it('a type-compatible write provider can violate the existing P-1 error identity obligation', async () => {
    const { root } = setup()
    const original = new Error('callback failure'),
      changed = new Error('provider changed failure')
    // This deliberately bad substitute has the public signature but does not preserve P-1.
    const substitute: Pick<Storage, 'write'> = {
      async write() {
        throw changed
      },
    }
    const observed = await substitute
      .write(async () => {
        throw original
      })
      .catch(error => error)
    expect(observed).toBe(changed)
    expect(observed).not.toBe(original)
    expect(readConformance({ root }).coverage.find(row => row.id === 'LSP')).toMatchObject({
      evidence: 'behavior',
    })
  })
})
