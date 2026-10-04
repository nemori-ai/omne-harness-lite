import { describe, expect, it } from 'vitest'
import { compareArchitecture } from '../src/arch/compare.ts'
import { extractArchitecture } from '../src/arch/extract.ts'
import { readIntents } from '../src/arch/intent.ts'
import { snapshotOf } from '../src/arch/snapshot.ts'
import { compareRevisions, readReflexion } from '../src/loop/sensors/reflexion.ts'
const root = '.meta_harness/design/realization'
const member = 'packages/session/example'
const yaml = `${root}/${member}/bindings.yaml`
const plugin = (keys = "'storage'", provided = "'actual'") =>
  `import { definePlugin } from '@omne-harness-lite/kernel-basis'; export const a = definePlugin({name:'example',inject:[${keys}],apply(ctx){ctx.provide(${provided},{})}})`
const intent = (provides = 'actual', injects = 'storage') =>
  `assembly:\n  plugins:\n    - name: example\n      source: design.md#plugin\n      provides: [${provides}]\n      injects: [${injects}]\n`
function snapshot(code = plugin(), declaration = intent(), extra: Record<string, string> = {}) {
  return snapshotOf(
    new Map(
      Object.entries({
        [`${member}/package.json`]:
          '{"name":"@omne-harness-lite/example","exports":{".":"./dist/index.js"}}',
        [`${member}/src/plugin.ts`]: code,
        [yaml]: declaration,
        ...extra,
      }),
    ),
  )
}
function compare(source: ReturnType<typeof snapshot>) {
  return compareArchitecture(extractArchitecture(source), readIntents(source, root))
}

describe('architecture intent comparison and protected baseline', () => {
  it('distinguishes converged, deviation and missing relationships with both source locations', () => {
    const result = compare(snapshot(plugin(), intent('absent')))
    expect(result.comparisons.find(item => item.kind === 'plugin')).toMatchObject({
      state: 'converged',
      key: 'example',
      declaration: { path: yaml },
    })
    expect(result.comparisons.find(item => item.kind === 'injects')).toMatchObject({
      state: 'converged',
      key: 'storage',
    })
    expect(result.comparisons.find(item => item.key === 'actual')).toMatchObject({
      state: 'deviation',
      implementation: { path: `${member}/src/plugin.ts` },
    })
    expect(result.comparisons.find(item => item.key === 'absent')).toMatchObject({
      state: 'missing',
      declaration: { path: yaml },
    })
  })
  it('unknown service names cannot prove absence, and event unknowns do not enter the service rate', () => {
    const result = compare(snapshot(plugin("'storage'", 'dynamic()')))
    expect(result.comparisons.find(item => item.kind === 'provides')).toMatchObject({
      state: 'unknown',
      key: 'actual',
    })
    expect(result.comparisons.filter(item => item.state === 'missing')).toEqual([])
    const source = extractArchitecture(
      snapshot(
        plugin() +
          "\nimport type {Context} from '@deepseek-ai/cordis'; export const b = {name:'b',apply(ctx:Context){ctx.emit(dynamic())}}",
      ),
    )
    expect(source.unknown.find(item => item.kind === 'emits')?.serviceIdentifier).toBe(false)
    expect(source.serviceIdentifiers.unresolved).toBe(0)
  })
  it('uses filesystem members for undeclared, no-design, not-built and source-location mismatch', () => {
    const result = compare(
      snapshot('', '{}', {
        [`${root}/${member}/README.md`]: '- 源码位置：尚未建包。',
        'packages/core/data/package.json': '{"name":"data"}',
        [`${root}/packages/core/data/bindings.yaml`]: 'assembly: {defines: [], plugins: []}',
        'packages/session/no-design/package.json': '{"name":"no-design"}',
        [`${root}/packages/session/future/bindings.yaml`]: intent(),
      }),
    )
    expect(result.lifecycle).toEqual(
      expect.arrayContaining([
        { member, kind: 'undeclared', path: yaml },
        { member, kind: 'source-location-mismatch', path: `${root}/${member}/README.md` },
        { member: 'packages/session/no-design', kind: 'no-design' },
        {
          member: 'packages/session/future',
          kind: 'not-built',
          path: `${root}/packages/session/future/bindings.yaml`,
        },
      ]),
    )
    expect(result.lifecycle.some(item => item.member === 'packages/core/data')).toBe(false)
    expect(result.comparisons.filter(item => item.member.endsWith('/future'))).toEqual([])
  })
  it('current source-location statements work in both directions and historical quotes stay unknown', () => {
    const future = 'packages/session/future'
    const result = compare(
      snapshot('', '{}', {
        [`${root}/${member}/README.md`]:
          '- 源码位置：`packages/session/example`。初稿时记录为“尚未建包”；后续实际组件及历史读面实现状态见本页事件。',
        [`${root}/${future}/bindings.yaml`]: intent(),
        [`${root}/${future}/README.md`]:
          '- 源码位置：`packages/session/future`——**已实现（HUB abc）**。',
        [`${root}/packages/core/coordinate/bindings.yaml`]: '{}',
        [`${root}/packages/core/coordinate/README.md`]: '- 源码位置：`packages/core/coordinate`。',
        'packages/core/quoted/package.json': '{"name":"quoted"}',
        [`${root}/packages/core/quoted/bindings.yaml`]: '{}',
        [`${root}/packages/core/quoted/README.md`]:
          '- 源码位置：`packages/core/quoted`，初稿时记录为“尚未建包”。',
      }),
    )
    expect(result.lifecycle.filter(item => item.kind === 'source-location-mismatch')).toEqual([
      { member: future, kind: 'source-location-mismatch', path: `${root}/${future}/README.md` },
    ])
  })
  it('source changes remain deviations when HEAD intent changes to agree with them', () => {
    const base = snapshot(),
      head = snapshot(plugin("'storage','surprise'"), intent('actual', 'storage, surprise'))
    const result = compareRevisions(head, base, root)
    expect(result.newDeviations).toMatchObject({
      status: 'data',
      data: [expect.objectContaining({ kind: 'injects', key: 'surprise' })],
    })
    expect(result.intentChanges).toMatchObject({
      status: 'data',
      data: [expect.objectContaining({ member, path: yaml })],
    })
    expect(
      compareRevisions(
        snapshot(
          plugin(),
          `# comment\n${intent().replace('provides: [actual]', "provides: ['actual']")}`,
        ),
        base,
        root,
      ).intentChanges,
    ).toEqual({ status: 'data', data: [] })
  })
  it('IC-5 exceptions authorize exact exported symbols, retain sharedStorage and keep mixed imports red', () => {
    const other = 'packages/tenancy/provider',
      declaration =
        intent() +
        `  importExceptions:\n    - target: ${other}\n      symbols: [readIn]\n      sharedStorage: membership-row\n      source: design.md#transaction\n`
    const extra = {
      [`${other}/package.json`]: '{"name":"@omne-harness-lite/provider"}',
      [`${root}/${other}/bindings.yaml`]: '{}',
      [`${other}/src/index.ts`]: 'export function readIn(){}; export function unsafe(){}',
    }
    const code =
      plugin() +
      "\nimport {readIn as alias, unsafe, type Shape} from '@omne-harness-lite/provider'\nimport * as all from '@omne-harness-lite/provider'"
    const allowed = compare(snapshot(code, declaration, extra))
    expect(allowed.exceptions).toEqual([
      expect.objectContaining({
        import: expect.objectContaining({ symbol: 'readIn', local: 'alias' }),
        declaration: {
          path: yaml,
          sharedStorage: 'membership-row',
          source: 'design.md#transaction',
        },
      }),
    ])
    expect(
      allowed.comparisons.filter(item => item.kind === 'import').map(item => item.key),
    ).toEqual([`${other}#*`, `${other}#Shape (type)`, `${other}#unsafe`])
    const result = compareRevisions(
      snapshot(code, declaration, extra),
      snapshot(plugin(), intent(), extra),
      root,
    )
    expect(result.newDeviations).toMatchObject({
      status: 'data',
      data: expect.arrayContaining([expect.objectContaining({ key: `${other}#readIn` })]),
    })
    expect(() => readIntents(snapshot('', declaration.replace('[readIn]', "['*']")), root)).toThrow(
      'exact nonempty symbols',
    )
  })
  it('member-internal imports are not IC-5 deviations; core/util and assemblies remain distinct', () => {
    const source = snapshot(
      plugin() + "\nimport {a} from './helper.js'; import {u} from '@omne-harness-lite/u'",
      intent(),
      {
        [`${member}/src/helper.ts`]: 'export const a=1',
        'packages/util/u/package.json': '{"name":"@omne-harness-lite/u"}',
        'apps/host/package.json': '{"name":"host"}',
        'apps/host/src/index.ts': "import {a} from '@omne-harness-lite/example'",
      },
    )
    expect(compare(source).comparisons.filter(item => item.kind === 'import')).toEqual([])
  })
  it('disabled sensors do not read missing roots and absent declarations provide concrete no-data', () => {
    expect(readReflexion('/does-not-exist', { enabled: false, nodeRoot: root })).toEqual({
      reflexion: { status: 'no-data', reason: '配置里关了' },
      intentChanges: { status: 'no-data', reason: '配置里关了' },
    })
    expect(readReflexion('/does-not-exist', { enabled: true, nodeRoot: root })).toEqual({
      reflexion: { status: 'no-data', reason: `${root} 缺失或没有 realization 节点` },
      intentChanges: { status: 'no-data', reason: '没给基线' },
    })
  })
  it('no declarations and removal of an undeclared node have the same semantic intent', () => {
    const before = snapshot('', '{}')
    const after = snapshotOf(new Map([...before.texts].filter(([path]) => path !== yaml)))
    expect(compareRevisions(after, before, root).intentChanges).toEqual({
      status: 'data',
      data: [],
    })
    expect(compareRevisions(after, undefined, root).intentChanges).toEqual({
      status: 'no-data',
      reason: '没给基线',
    })
  })
})
