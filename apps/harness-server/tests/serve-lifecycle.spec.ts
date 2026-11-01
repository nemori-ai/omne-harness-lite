// `serve` 模式下的可见性与关闭登记落点（R1-4，DP1-C15）：直接用装载器与登记表，能看到根、fiber 与在册句柄。
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { identityClock } from '../src/entry/identity-clock.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../src/lifecycle.ts'
import {
  disposeTree,
  startTree,
  type EntryObject,
  type RowSpec,
  type StartResult,
} from '../src/loader.ts'
import { serveProfile } from '../src/profile.ts'
import { rowDeclarationOf } from '../src/row.ts'
import { createStubPlugin, type StubEvent } from '../src/s0/stub-plugin.ts'
import { monotonicClock, runShutdown } from '../src/shutdown.ts'
import { createTrust } from '../src/trust.ts'
import type {
  EntryEnv,
  EntryObjectModule,
  LifecyclePhase,
  RowId,
  ServiceName,
  TreeRow,
  Visibility,
} from '../src/types.ts'
import { FixtureStorageService } from './fixtures/serve/definitions.ts'
import {
  fixtureStorage,
  fixtureStorageHost,
  storageEvents,
  syntheticRow,
} from './fixtures/serve/index.ts'

const profile = serveProfile()

type Loaded = {
  root: Context
  result: StartResult
  registry: LifecycleRegistry
  events: StubEvent[]
}
const live: Loaded[] = []

beforeEach(() => {
  storageEvents.length = 0
})
afterEach(async () => {
  while (live.length > 0) {
    const loaded = live.pop()!
    if (loaded.result.kind === 'started') await disposeTree(loaded.root, loaded.result.rows)
    else await loaded.root.fiber.dispose()
  }
})

function treeRow(id: string, plugin: string, source: TreeRow['source'] = 'distribution'): TreeRow {
  return { id: id as RowId, plugin, config: {}, source }
}

/** 真实导出的 RowSpec，按 `runServe` 的办法从声明读回。 */
function declared(id: string, plugin: Plugin, source?: TreeRow['source']): RowSpec {
  const declaration = rowDeclarationOf(plugin)
  if (declaration === undefined) throw new Error('not a declared row')
  const via = declaration.lifecycle.kind === 'entry-object' ? declaration.lifecycle.via : null
  return {
    row: treeRow(id, 'declared', source),
    manifest: declaration.manifest,
    plugin,
    implementation: declaration.implementation,
    declared: { row: declaration.row, via },
  }
}

function stub(id: string, events: StubEvent[], source?: TreeRow['source']): RowSpec {
  const manifest = profile.stubManifests.get(id as RowId)
  if (manifest === undefined) throw new Error(`no stub manifest for ${id}`)
  return {
    row: treeRow(id, 'stubPlugin', source),
    manifest,
    plugin: createStubPlugin({
      id: id as RowId,
      manifest,
      hooks: { observe: event => events.push(event) },
    }),
  }
}

async function load(
  specs: readonly RowSpec[],
  modules: readonly EntryObjectModule[],
  visibility: Visibility = profile.visibility,
): Promise<Loaded> {
  const root = new Context()
  const trust = createTrust(
    [...new Set([...visibility.values()].flat())].map(name => ({ id: name, names: [name] })),
    visibility,
  )
  const expected = new Map<RowId, LifecyclePhase>()
  for (const spec of specs) {
    if (spec.manifest.phase !== null) expected.set(spec.row.id, spec.manifest.phase)
  }
  const registry = new LifecycleRegistry({ expected, clock: monotonicClock, requestStop: () => {} })
  await root.plugin(S0AssemblyLifecycleService, registry)
  const env: EntryEnv = {
    stateRoot: '/unused',
    readTrusted: name => trust.contextForName(root, name),
    once: (_key, create) => create(),
  }
  const entryObjects: EntryObject[] = modules.map(module => ({
    name: module.name,
    implementation: module.implementation,
    registersFor: module.registersFor ?? [],
    install: scope => module.install(scope, env),
  }))
  const events: StubEvent[] = []
  const result = await startTree({
    root,
    trust,
    rows: specs,
    entryObjects,
    readinessTimeoutMs: 1000,
    barrier: () => {},
  })
  const loaded = { root, result, registry, events }
  live.push(loaded)
  return loaded
}

function state(loaded: Loaded, id: string) {
  if (loaded.result.kind !== 'started') throw new Error(`tree not started: ${loaded.result.kind}`)
  const found = loaded.result.report.rows.find(row => row.id === id)
  if (found === undefined) throw new Error(`no row ${id}`)
  return found
}

function injected(events: readonly StubEvent[], row: string, name: ServiceName): unknown {
  const hit = events.find(e => e.kind === 'injected' && e.row === row && e.name === name)
  return hit !== undefined && 'value' in hit ? hit.value : 'NOT-OBSERVED'
}

describe('serve visibility (R1-4, same mechanism as trust.spec, formal names)', () => {
  test('the fixture storage row provides under the label: the root cannot get it, the identity double gets the instance', async () => {
    const events: StubEvent[] = []
    const loaded = await load(
      [declared('storage', fixtureStorage), stub('identity', events)],
      [fixtureStorageHost(), identityClock],
    )
    expect(state(loaded, 'storage').state).toBe('ACTIVE')
    expect(state(loaded, 'identity').state).toBe('ACTIVE')
    expect(loaded.root.reflect.get('storage')).toBeUndefined()
    expect(injected(events, 'identity', 'storage')).toBeInstanceOf(FixtureStorageService)
  })

  test('an operator-inserted row that injects storage is refused before any plugin body runs', async () => {
    const events: StubEvent[] = []
    const intruder: RowSpec = {
      ...stub('identity', events, 'operator'),
      row: treeRow('intruder', 'stubPlugin', 'operator'),
    }
    const loaded = await load(
      [declared('storage', fixtureStorage), intruder],
      [fixtureStorageHost()],
    )
    expect(loaded.result).toMatchObject({ kind: 'rejected', exitCode: 2 })
    expect(events).toEqual([])
    expect(storageEvents).toEqual([])
  })

  test('a second provider of storage under the same label FAILS with has been registered', async () => {
    const twin = syntheticRow({ id: 'fx-storage-twin', provides: ['storage'] })
    const visibility: Visibility = new Map([
      ['storage' as RowId, ['storage']],
      ['fx-storage-twin' as RowId, ['storage']],
    ])
    const loaded = await load(
      [declared('storage', fixtureStorage), declared('fx-storage-twin', twin)],
      [fixtureStorageHost()],
      visibility,
    )
    expect(state(loaded, 'storage').state).toBe('ACTIVE')
    const second = state(loaded, 'fx-storage-twin')
    expect(second.state).toBe('FAILED')
    expect(second.error?.message).toContain('has been registered')
  })
})

describe('entry-object-borne registration lands on the row fiber (DP1-C15 kind 2)', () => {
  test('attachControl registers for the storage row: the handle leaves with the storage fiber', async () => {
    const loaded = await load([declared('storage', fixtureStorage)], [fixtureStorageHost()])
    if (loaded.result.kind !== 'started') throw new Error('not started')
    expect(loaded.registry.liveRows()).toEqual(['storage'])
    await loaded.result.rows[0]!.fiber.dispose()
    expect(loaded.registry.liveRows()).toEqual([])
    const report = await runShutdown(
      loaded.registry,
      new Map([['storage' as RowId, 'storage']]),
      500,
      monotonicClock,
    )
    expect(report.outcomes[0]).toMatchObject({
      row: 'storage',
      result: { kind: 'disposed-before-stop' },
    })
    // 撤除时 disposer 发起了一次关闭；协调者没有再调用它。
    expect(storageEvents.filter(e => e === 'close:assembly')).toHaveLength(1)
  })

  test('a host that does not register: the storage row is not-registered, the report is incomplete', async () => {
    const loaded = await load(
      [declared('storage', fixtureStorage)],
      [fixtureStorageHost({ register: false })],
    )
    expect(state(loaded, 'storage').state).toBe('ACTIVE')
    expect(loaded.registry.liveRows()).toEqual([])
    const report = await runShutdown(
      loaded.registry,
      new Map([['storage' as RowId, 'storage']]),
      500,
      monotonicClock,
    )
    expect(report).toMatchObject({
      overall: 'incomplete',
      outcomes: [{ row: 'storage', result: { kind: 'not-registered' } }],
    })
    expect(storageEvents).toEqual([])
  })
})
