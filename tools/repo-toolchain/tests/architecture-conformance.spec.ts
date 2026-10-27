// @module-tag slow
// Real Git commits exercise both version-local resolution and baseline intent protection.
import { readFileSync, rmSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readConformance } from '../src/arch/conformance.ts'
import {
  parseConstraints,
  readConstraints,
  CONSTRAINT_PATH,
  LEGACY_CONSTRAINT_PATH,
  constraintDependencies,
} from '../src/arch/constraints.ts'
import {
  activeRoles,
  RULE_IDS,
  type ArchitectureConstraints,
} from '../src/arch/conformance-model.ts'
import { readArchitectureSource } from '../src/arch/source.ts'
import { readConformanceSensor } from '../src/loop/sensors/conformance.ts'
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
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'
afterEach(removeTemporaries)
const ui = 'apps/ui',
  storage = 'packages/core/storage',
  sql = 'packages/infra/sql',
  policy = 'packages/domain/policy'
const existingRuleIds = [
  'LAYER-ENTRY',
  'LAYER-DIP',
  'IC-1',
  'IC-2',
  'IC-3',
  'IC-4',
  'IC-5',
] as const
const h1RuleIds = [
  'H1-SESSION-FACTS',
  'H1-AGENT-REASSEMBLY',
  'H1-MODEL-LIFETIME',
  'H1-OBSERVATION-CONTINUITY',
] as const
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
      JSON.stringify({
        name: `@example/${name}`,
        exports: { '.': './dist/index.js', './cordis': './dist/cordis.js' },
      }),
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
    rules: existingRuleIds.map(id => ({ id, source: 'accepted.md#rules' })),
  }
  write(
    root,
    'docs/architecture/accepted.md',
    '# Accepted\n\n## ui\n## compose\n## port\n## adapter\n## policy\n## rules\n## same-commit\n',
  )
  write(root, 'docs/architecture/design.md', '# Design\n\n## same-commit\n')
  write(root, CONSTRAINT_PATH, JSON.stringify(intent))
  return { root, intent, base: commit(root, 'accepted expectations') }
}
describe('H1 constraint registration', () => {
  const sourcePath = 'docs/architecture/h1.md'
  const sourceText = '# H1\n\n' + h1RuleIds.map(id => `## ${id}\n`).join('\n')
  const declaration = (id: string) => ({ id, source: `${sourcePath}#${id.toLowerCase()}` })
  const intentFor = (ids: readonly string[]) => ({
    schemaVersion: 3,
    domains: [],
    roles: [],
    rules: ids.map(declaration),
  })

  it('keeps the exact closed rule tuple and its existing order', () => {
    expect(RULE_IDS).toEqual([...existingRuleIds, ...h1RuleIds])
  })
  it.each(existingRuleIds)('still parses existing rule %s', id => {
    expect(parseConstraints(JSON.stringify(intentFor([id]))).rules).toEqual([declaration(id)])
  })
  it.each(h1RuleIds)('parses and resolves %s with its source dependency', id => {
    const intent = intentFor([id])
    expect(parseConstraints(JSON.stringify(intent)).rules).toEqual([declaration(id)])
    const root = repository()
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    write(root, sourcePath, sourceText)
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    const checked = readConstraints(root, readArchitectureSource(root).source)
    expect(checked.value?.rules).toEqual([declaration(id)])
    expect(checked.sources).toEqual([
      { path: sourcePath, digest: expect.stringMatching(/^[a-f0-9]{64}$/u) },
    ])
    expect(constraintDependencies(root)).toEqual([CONSTRAINT_PATH, sourcePath])
  })
  it.each(['H1-INVENTED', 'H1-SESSION-FACT'])('rejects unregistered rule %s', id => {
    expect(() => parseConstraints(JSON.stringify(intentFor([id])))).toThrow(
      `Unknown architecture rule ${id}`,
    )
  })
  it.each(h1RuleIds)('rejects duplicate registration of %s', id => {
    expect(() => parseConstraints(JSON.stringify(intentFor([id, id])))).toThrow(
      'Architecture constraints contain duplicate identities',
    )
  })
  it.each(h1RuleIds)('requires version-local source files and anchors for %s', id => {
    const root = repository()
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    write(root, CONSTRAINT_PATH, JSON.stringify(intentFor([id])))
    for (const failure of ['missing source', 'missing source anchor']) {
      if (failure === 'missing source') rmSync(join(root, sourcePath), { force: true })
      else write(root, sourcePath, '# Unrelated heading\n')
      expect(() => readConstraints(root, readArchitectureSource(root).source)).toThrow(failure)
      expect(() => readConformance({ root })).toThrow(failure)
      const revision = commit(root, failure)
      write(root, sourcePath, sourceText)
      expect(readConstraints(root, readArchitectureSource(root).source).value?.rules).toEqual([
        declaration(id),
      ])
      expect(() => readConstraints(root, readArchitectureSource(root, revision).source)).toThrow(
        failure,
      )
      expect(() => readConformance({ root, revision })).toThrow(failure)
    }
  })
  it('reports each H1 obligation once as unexecuted behavior without conformance rows', () => {
    const { root, intent } = setup()
    write(root, sourcePath, sourceText)
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({
        ...intent,
        rules: [
          ...intent.rules,
          ...h1RuleIds.map(id => ({ id, source: `h1.md#${id.toLowerCase()}` })),
        ],
      }),
    )
    const report = readConformance({ root })
    expect(report.current.value?.rules.map(rule => rule.id)).toEqual([
      ...existingRuleIds,
      ...h1RuleIds,
    ])
    for (const id of h1RuleIds) {
      const entries = report.coverage.filter(entry => entry.id === id)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        evidence: 'behavior',
        scope: expect.stringContaining('本报告未执行'),
      })
      expect(entries[0]?.scope).toContain('登记来源不证明运行时符合')
      expect(report.rows.filter(row => row.rule === id)).toEqual([])
    }
    for (const id of existingRuleIds)
      expect(report.coverage.filter(entry => entry.id === id)).toEqual([
        { id, evidence: 'static-subset', scope: '仅已解析声明/入口；converged 不表示整体符合' },
      ])
    expect(report.rows.length).toBeGreaterThan(0)
  })
})
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
  it('skips IC-4 for an apps member root and packages/core/kernel-basis', () => {
    const { root, base } = setup()
    const basis = 'packages/core/kernel-basis'
    const cordis = "import {Context} from '@deepseek-ai/cordis'\nexport const bound = Context\n"
    write(root, `${ui}/src/index.ts`, cordis)
    write(root, `${policy}/src/index.ts`, cordis)
    write(
      root,
      `${basis}/package.json`,
      JSON.stringify({ name: '@example/kernel-basis', exports: { '.': './dist/index.js' } }),
    )
    write(root, `${basis}/src/index.ts`, cordis)
    const deviations = readConformance({ root, base }).rows.filter(
      row => row.rule === 'IC-4' && row.state === 'deviation',
    )
    expect(deviations.map(row => row.member)).toEqual([policy])
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
  it('rejects invalid or ambiguous precise import exceptions before reporting', () => {
    const { intent } = setup()
    const exception = {
      id: 'e',
      member: ui,
      target: sql,
      symbols: ['value'],
      sharedStorage: 'accepted-row',
      source: 'accepted.md#same-commit',
    }
    for (const rows of [
      null,
      [{ ...exception, member: `${ui}/**` }],
      [{ ...exception, target: `${sql}/src/index.ts` }],
      [{ ...exception, symbols: [] }],
      [{ ...exception, symbols: ['*'] }],
      [{ ...exception, symbols: ['value', 'value'] }],
      [{ ...exception, source: '' }],
      [{ ...exception, sharedStorage: '' }],
      [{ ...exception, policy: 'allow-all' }],
      [exception, { ...exception, id: 'different-id', source: 'different.md#claim' }],
    ])
      expect(() =>
        parseConstraints(JSON.stringify({ ...intent, importExceptions: rows })),
      ).toThrow()
    expect(
      parseConstraints(JSON.stringify({ ...intent, importExceptions: [exception] }))
        .importExceptions,
    ).toEqual([exception])
  })
  it('BASE exact-symbol IC-5 exceptions remain scoped and a layer conflict stays pending', () => {
    const { root, intent } = setup()
    const declaration = CONSTRAINT_PATH
    write(
      root,
      declaration,
      JSON.stringify({
        ...intent,
        importExceptions: [
          {
            id: 'same-commit',
            member: ui,
            target: sql,
            symbols: ['value'],
            sharedStorage: 'accepted-row',
            source: 'design.md#same-commit',
          },
        ],
      }),
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
      JSON.stringify({
        ...intent,
        importExceptions: [
          {
            id: 'same-commit',
            member: ui,
            target: sql,
            symbols: ['value', 'unsafe'],
            sharedStorage: 'accepted-row',
            source: 'design.md#same-commit',
          },
        ],
      }),
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
  it('the global owner preserves actual injection additions in hook output', () => {
    const { root } = setup()
    write(root, `${policy}/src/plugin.ts`, `export const p = { name:'p', apply() {} }`)
    const base = commit(root, 'actual plugin before dependency addition')
    write(
      root,
      `${policy}/src/plugin.ts`,
      `import {Context} from '@deepseek-ai/cordis'
export const p = { name: 'p', inject: ['newDependency'], apply(ctx:Context) { ctx.get('newDependency') } }
`,
    )
    const readings = measureForHook(root, base, readLoopConfig(), readMetricsConfig())
    expect(readings.explain.assemblyDelta).toMatchObject({
      status: 'data',
      data: {
        added: expect.arrayContaining([
          expect.objectContaining({ key: 'newDependency', kind: 'injects' }),
        ]),
      },
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
    // DIRECTION 行来自运行检查器的仓库，与被比较的版本无关：runner 的 constraints.json 是 schema 3 时它们总会出现。
    expect(
      compared.rows
        .filter(row => row.rule !== 'DIRECTION')
        .every(row => row.rule === 'ROLE' || row.rule === 'INPUT'),
    ).toBe(true)
    expect(compared.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'INPUT', key: 'baseline', state: 'unknown' }),
      ]),
    )
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
    const substitute: { write: (operation: () => Promise<void>) => Promise<void> } = {
      async write() {
        throw changed
      },
    }
    const observed = await substitute
      .write(async () => {
        throw original
      })
      .catch((error: unknown) => error)
    expect(observed).toBe(changed)
    expect(observed).not.toBe(original)
    expect(readConformance({ root }).coverage.find(row => row.id === 'LSP')).toMatchObject({
      evidence: 'behavior',
    })
  })
})

describe('version-local constraint migration', () => {
  it('validates the current repository constraints against their actual Markdown sources', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const input = readConstraints(root, readArchitectureSource(root).source)
    expect(input.path).toBe(CONSTRAINT_PATH)
    expect(input.value).toEqual(parseConstraints(readFileSync(join(root, CONSTRAINT_PATH), 'utf8')))
    expect(
      input.sources.some(source => /^(?:apps|packages)\.0\.0\.1\.legacy\//u.test(source.path)),
    ).toBe(false)
  })
  const archivedSource = 'packages.0.0.1.legacy/core/retired/SPEC.md'
  function retirementIntent(paths: readonly string[]): ArchitectureConstraints {
    return {
      schemaVersion: 2,
      domains: [],
      roles: [
        {
          id: 'retired',
          paths,
          layer: 'interaction',
          domains: [],
          status: 'adopted',
          source: archivedSource,
        },
      ],
      rules: [{ id: 'LAYER-ENTRY', source: 'docs/architecture/accepted.md#rules' }],
    }
  }
  it('retires only unmatched historical roles without reading their sources or losing their deletion', () => {
    const { root } = setup()
    const path = `${ui}/src/retired.ts`
    const intent = retirementIntent([path])
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    const base = commit(root, 'retired source with no active implementation')
    write(root, CONSTRAINT_PATH, JSON.stringify({ ...intent, roles: [] }))
    write(root, path, "import {value} from '@example/sql'; export const reused = value")
    const report = readConformance({ root, base })
    expect(report.baseline?.source.commit).toBe(base)
    expect(report.baseline?.retiredRoleIds).toEqual(['retired'])
    expect(report.baseline?.value?.roles).toEqual(intent.roles)
    expect(report.baseline === undefined ? undefined : activeRoles(report.baseline)).toEqual([])
    expect(report.baseline?.sources.map(source => source.path)).toEqual([
      'docs/architecture/accepted.md',
    ])
    expect(report.changes).toEqual([
      expect.objectContaining({
        id: 'global-architecture',
        before: expect.stringContaining('retired'),
        after: expect.not.stringContaining('retired'),
      }),
    ])
    expect(report.rows.some(row => row.rule === 'LAYER-ENTRY' && row.state === 'deviation')).toBe(
      false,
    )
    expect(constraintDependencies(root, base)).toEqual([
      CONSTRAINT_PATH,
      'docs/architecture/accepted.md',
    ])
    expect(() => readConformance({ root, revision: base })).toThrow(
      'legacy source is not an active architecture input',
    )
  })
  it.each([`${ui}/src/view.ts`, `${ui}/src/**`])(
    'does not retire historical roles matching active source %s',
    path => {
      const { root, intent } = setup()
      write(root, CONSTRAINT_PATH, JSON.stringify(retirementIntent([path])))
      const base = commit(root, 'legacy source still governs active code')
      write(root, CONSTRAINT_PATH, JSON.stringify(intent))
      expect(() => readConformance({ root, base })).toThrow(
        'legacy source is not an active architecture input',
      )
    },
  )
  it('rejects current legacy sources even when unmatched and keeps retained historical anchors version-local', () => {
    const { root } = setup()
    const intent = retirementIntent(['apps/gone/src/**'])
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    expect(() => readConformance({ root })).toThrow(
      'legacy source is not an active architecture input',
    )
    const broken = {
      ...intent,
      rules: [{ id: 'LAYER-ENTRY', source: 'docs/architecture/accepted.md#head-only' }],
    }
    write(root, CONSTRAINT_PATH, JSON.stringify(broken))
    const base = commit(root, 'retired role alongside invalid active source')
    write(root, CONSTRAINT_PATH, JSON.stringify({ ...broken, roles: [] }))
    write(root, 'docs/architecture/accepted.md', '# Accepted\n\n## head-only\n')
    expect(() => readConformance({ root, base })).toThrow('missing source anchor')
  })
  it('reads legacy BASE and current HEAD independently, without inventing changes for a path-only move', () => {
    const { root, intent } = setup()
    const legacyDirectory = '.meta_harness/design/architecture'
    write(
      root,
      `${legacyDirectory}/accepted.md`,
      readFileSync(join(root, 'docs/architecture/accepted.md'), 'utf8'),
    )
    write(
      root,
      `${legacyDirectory}/design.md`,
      readFileSync(join(root, 'docs/architecture/design.md'), 'utf8'),
    )
    rmSync(join(root, CONSTRAINT_PATH))
    write(root, LEGACY_CONSTRAINT_PATH, JSON.stringify(intent))
    const base = commit(root, 'historical unique constraint owner')
    rmSync(join(root, LEGACY_CONSTRAINT_PATH))
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    const head = commit(root, 'move unique current owner')
    const report = readConformance({ root, base, revision: head })
    expect(report.baseline?.path).toBe(LEGACY_CONSTRAINT_PATH)
    expect(report.current.path).toBe(CONSTRAINT_PATH)
    expect(report.changes).toEqual([])
    expect(report.rows.some(row => row.rule === 'INPUT')).toBe(false)
  })
  it('rejects duplicate current owners, malformed input and source coordinates borrowed from HEAD', () => {
    const { root, intent } = setup()
    write(root, LEGACY_CONSTRAINT_PATH, JSON.stringify(intent))
    expect(() => readConformance({ root })).toThrow('Ambiguous architecture constraints')
    rmSync(join(root, LEGACY_CONSTRAINT_PATH))
    write(root, CONSTRAINT_PATH, '{bad JSON')
    expect(() => readConformance({ root })).toThrow()
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({ ...intent, rules: [{ id: 'IC-1', source: 'accepted.md#head-only' }] }),
    )
    const base = commit(root, 'missing anchor at BASE')
    write(root, 'docs/architecture/accepted.md', '# Accepted\n\n## head-only\n')
    expect(() => readConformance({ root, base })).toThrow('missing source anchor')
  })
  it('schema2 resolves every source from root, rejects nonexistent and fenced anchors, and preserves duplicate and explicit anchors', () => {
    const { root } = setup()
    const input = {
      schemaVersion: 2,
      domains: [],
      roles: [],
      rules: [{ id: 'IC-1', source: 'guides/policy.md#重复-1' }],
    }
    write(
      root,
      'guides/policy.md',
      '# 重复\n\n# 重复\n\n<a id="explicit"></a>\n\n```md\n# counterfeit\n<a id="counterfeit-html"></a>\n```\n\n<!--\n# ghost\n<a id="ghost-html"></a>\n-->\n',
    )
    write(root, CONSTRAINT_PATH, JSON.stringify(input))
    expect(readConformance({ root }).current.value?.schemaVersion).toBe(2)
    for (const anchor of ['重复', 'explicit']) {
      write(
        root,
        CONSTRAINT_PATH,
        JSON.stringify({ ...input, rules: [{ id: 'IC-1', source: `guides/policy.md#${anchor}` }] }),
      )
      expect(() => readConformance({ root })).not.toThrow()
    }
    for (const anchor of ['counterfeit', 'counterfeit-html', 'ghost', 'ghost-html', '重复-2']) {
      write(
        root,
        CONSTRAINT_PATH,
        JSON.stringify({ ...input, rules: [{ id: 'IC-1', source: `guides/policy.md#${anchor}` }] }),
      )
      expect(() => readConformance({ root })).toThrow('missing source anchor')
    }
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({ ...input, rules: [{ id: 'IC-1', source: 'guides/missing.md' }] }),
    )
    expect(() => readConformance({ root })).toThrow('missing source')
  })
  it('rejects a source symlink escaping the worktree', () => {
    const { root } = setup()
    symlinkSync('/etc/passwd', join(root, 'docs/architecture/escaped.md'))
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({
        schemaVersion: 2,
        domains: [],
        roles: [],
        rules: [{ id: 'IC-1', source: 'docs/architecture/escaped.md' }],
      }),
    )
    expect(() => readConformance({ root })).toThrow('escapes checkout')
  })
  it('missing HEAD or BASE stays visible and cannot become a successful empty policy', () => {
    const { root, base, intent } = setup()
    rmSync(join(root, CONSTRAINT_PATH))
    const missing = readConformance({ root, base })
    expect(missing.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'INPUT', key: 'current', state: 'unknown' }),
      ]),
    )
    expect(missing.changes[0]?.after).toBeNull()
    expect(readConformanceSensor(root, true, base).status).toBe('no-data')
    const noOwner = commit(root, 'missing owner')
    write(root, CONSTRAINT_PATH, JSON.stringify(intent))
    expect(readConformanceSensor(root, true, noOwner).status).toBe('no-data')
    expect(readConstraints(root, readArchitectureSource(root, noOwner).source).value).toBeNull()
  })
  it('triggers and performs measurements when only a cited source changes', () => {
    const { root, base } = setup()
    write(
      root,
      'docs/architecture/accepted.md',
      readFileSync(join(root, 'docs/architecture/accepted.md'), 'utf8') +
        '\nNew accepted evidence.\n',
    )
    expect(touchedBase(root, 'main')).toBe(base)
    const measured = measureForHook(root, base, readLoopConfig(), readMetricsConfig())
    expect(measured.explain.conformance?.status).toBe('data')
    expect(readConformance({ root, base }).sourceChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'docs/architecture/accepted.md',
          before: expect.any(String),
          after: expect.any(String),
        }),
      ]),
    )
    expect(findingsOf(measured)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('架构依据字节变化') }),
      ]),
    )
  })

  it.each(['json', 'source'])('runs the actual stop hook for a %s-only change', mode => {
    const { root, intent } = setup()
    const home = temporaryDirectory('source-hook-home-')
    if (mode === 'json')
      write(
        root,
        CONSTRAINT_PATH,
        JSON.stringify({ ...intent, rules: intent.rules.filter(row => row.id !== 'IC-1') }),
      )
    else
      write(
        root,
        'docs/architecture/accepted.md',
        readFileSync(join(root, 'docs/architecture/accepted.md'), 'utf8') +
          '\nChanged source evidence.\n',
      )
    const started = performance.now()
    const output = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(new URL('../src/loop/stop-hook.ts', import.meta.url)),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 40_000,
        input: JSON.stringify({
          hook_event_name: 'SubagentStop',
          stop_hook_active: false,
          cwd: root,
        }),
        env: {
          ...process.env,
          OMNE_METRICS_HOME: home,
          // 夹具仓库没有回路配置：配置由运行检查器的仓库（本仓库）提供。
          OMNE_RUNNER_ROOT: fileURLToPath(new URL('../../../', import.meta.url)),
        },
      },
    )
    expect(performance.now() - started).toBeLessThan(40_000)
    expect(output.error).toBeUndefined()
    expect(output.status).toBe(0)
    expect(output.stderr).toBe('')
    const parsed = JSON.parse(output.stdout)
    expect(Object.keys(parsed)).toEqual(['decision', 'reason'])
    expect(parsed.decision).toBe('block')
    expect(parsed.reason).toContain(mode === 'json' ? '架构预期改动' : '架构依据字节变化')
  })
  it('allows a non-core definition owner and rejects a provider leaking through its public definition entry', () => {
    const { root, intent } = setup()
    const member = 'packages/agent/capability'
    write(
      root,
      `${member}/package.json`,
      JSON.stringify({
        name: '@example/capability',
        exports: {
          '.': './dist/api.js',
          './service': './dist/service.js',
          './cordis': './dist/plugin.js',
        },
      }),
    )
    write(root, `${member}/src/api.ts`, 'export type Operation = () => void')
    write(
      root,
      `${member}/src/service.ts`,
      "import {Service} from '@deepseek-ai/cordis'\n/** @contract capability */\nexport abstract class Capability extends Service {static readonly provide = 'capability'}",
    )
    write(
      root,
      `${member}/src/plugin.ts`,
      "import {Capability} from './service.js'; export class Provider extends Capability {}",
    )
    write(
      root,
      CONSTRAINT_PATH,
      JSON.stringify({
        ...intent,
        roles: [
          ...intent.roles,
          {
            id: 'capability',
            paths: [`${member}/src/**`],
            layer: 'contract',
            domains: [],
            status: 'adopted',
            source: 'accepted.md',
          },
        ],
      }),
    )
    const base = commit(root, 'accepted capability owner')
    write(
      root,
      `${policy}/src/index.ts`,
      "import {Capability} from '@example/capability/service'; export const definition = Capability",
    )
    let rows = readConformance({ root, base }).rows
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'IC-1', member, state: 'converged', key: 'capability' }),
        expect.objectContaining({
          rule: 'IC-5',
          key: '@example/capability/service#Capability',
          state: 'converged',
        }),
      ]),
    )
    write(
      root,
      `${member}/src/service.ts`,
      readFileSync(join(root, `${member}/src/service.ts`), 'utf8') +
        "\nexport {Provider} from './plugin.js'",
    )
    rows = readConformance({ root, base }).rows
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-5',
          key: '@example/capability/service#Capability',
          state: 'deviation',
        }),
      ]),
    )
    write(root, `${member}/src/api.ts`, "export {Provider} from './plugin.js'")
    expect(readConformance({ root, base }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-4',
          member,
          state: 'deviation',
          reason: expect.stringContaining('api.ts'),
        }),
      ]),
    )
  })
  it('does not grant public-definition ownership through another member re-export', () => {
    const { root } = setup()
    write(root, `${storage}/src/cordis.ts`, 'export {}')
    write(
      root,
      `${storage}/src/private.ts`,
      "import {Service} from '@deepseek-ai/cordis'\n/** @contract private */\nexport abstract class Private extends Service {static provide = 'private'}",
    )
    write(
      root,
      `${policy}/src/index.ts`,
      "export {Private} from '../../../core/storage/src/private.js'",
    )
    expect(readConformance({ root }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-1',
          member: storage,
          key: 'private',
          state: 'deviation',
        }),
      ]),
    )
  })
  it('does not exempt an independent plugin merely because its name matches a definition', () => {
    const { root } = setup()
    write(
      root,
      `${storage}/src/cordis.ts`,
      "import {Service, Context} from '@deepseek-ai/cordis'\n/** @contract registry */\nexport class Registry extends Service {static readonly provide = 'registry'}\nexport const plugin = {name:'Registry', apply(ctx: Context) {ctx.get('registry')}}",
    )
    write(
      root,
      `${policy}/src/index.ts`,
      "import {Registry} from '@example/storage/cordis'; export const registry = Registry",
    )
    expect(readConformance({ root }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-5',
          key: '@example/storage/cordis#Registry',
          state: 'deviation',
        }),
      ]),
    )
  })
})
