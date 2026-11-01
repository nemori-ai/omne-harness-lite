// `storageHost` 入口对象（sql-contract §2.3 的装配关闭适配器）：构造期核对材料摘要；保存每一代控制口；`stop` 对每一代
// `close({ initiator: 'assembly' })`；`register` 被拒时关闭刚保存的控制口（N-r2-2）；报告确定后才 `assemblyReportSettled`；
// 停止之后租约口不再准入。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test } from 'vitest'
import type {
  SqlMaterialCatalog,
  StorageCloseResult,
  StorageControl,
} from '@omne-harness/sql-contract'
import { IDENTITY_PARTICIPANT } from '@omne-harness/identity-sql'
import { StorageHostService } from '@omne-harness/sql-contract/cordis'
import {
  StorageHostAdapter,
  catalogProblems,
  storageHost,
  storageHostModule,
} from '../../../src/entry/storage-host.ts'
import {
  LifecycleRefusedError,
  LifecycleRegistry,
  S0AssemblyLifecycleService,
} from '../../../src/lifecycle.ts'
import { storageCatalog } from '../../../src/rows/storage/catalog.ts'
import { monotonicClock, runShutdown } from '../../../src/shutdown.ts'
import type { LifecyclePhase, RowId } from '../../../src/types.ts'
import { loadStorageTree, type LoadedTree } from './fixtures/tree.ts'

const STORAGE = 'storage' as RowId

type FakeControl = StorageControl & {
  readonly closes: Array<'assembly' | 'disposal'>
  settled: number
}

function fakeControl(answer: () => Promise<StorageCloseResult>): FakeControl {
  const control: FakeControl = {
    closes: [],
    settled: 0,
    close(input) {
      control.closes.push(input.initiator)
      return answer()
    },
    assemblyReportSettled() {
      control.settled += 1
    },
  }
  return control
}

const closed = (): Promise<StorageCloseResult> => Promise.resolve({ kind: 'closed' })

async function hostOn(expected: ReadonlyMap<RowId, LifecyclePhase>) {
  const root = new Context()
  const registry = new LifecycleRegistry({ expected, clock: monotonicClock, requestStop: () => {} })
  await root.plugin(S0AssemblyLifecycleService, registry)
  const host = new StorageHostAdapter(root, storageCatalog())
  return { root, registry, host }
}

const expectedStorage = new Map<RowId, LifecyclePhase>([[STORAGE, 'storage']])

function tampered(catalog: SqlMaterialCatalog): SqlMaterialCatalog {
  const [first, ...rest] = catalog.participants
  if (first === undefined) throw new Error('catalog has no participant')
  return {
    ...catalog,
    participants: [{ ...first, codeDigest: '0'.repeat(64) }, ...rest],
  }
}

const live: LoadedTree[] = []
const dirs: string[] = []
afterEach(async () => {
  while (live.length > 0) await live.pop()!.dispose()
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('materials (acceptance 4)', () => {
  test('the release catalog has no digest problem and declares no combination for the provider to auto-register', () => {
    const catalog = storageCatalog()
    expect(catalogProblems(catalog)).toEqual([])
    expect(catalog.catalogProtocol).toBe('sql-catalog/1')
    expect(catalog.participants.map(item => item.participant)).toContain('session')
    // identity 行（identity-sql）在 `system` 域登记自己的组合，它的材料必须在同一份发行目录里。
    expect(catalog.participants.map(item => item.participant)).toContain(IDENTITY_PARTICIPANT)
    expect(catalog.declaredCombinations).toEqual({ tenant: null, system: null })
  })

  test('a tampered digest is listed by name and fails install', async () => {
    const problems = catalogProblems(tampered(storageCatalog()))
    expect(problems).toEqual(['material_digest_mismatch: participant session'])
    const module = storageHostModule({ catalog: () => tampered(storageCatalog()) })
    const root = new Context()
    expect(() =>
      module.install(root, {
        stateRoot: '/unused',
        readTrusted: () => root,
        once: (_key, create) => create(),
      }),
    ).toThrow(/material_digest_mismatch: participant session/)
    expect(root.get('storageHost')).toBeUndefined()
  })

  test('the entry object is the storageHost definition subclass, real, registering for the storage row', async () => {
    expect(storageHost).toMatchObject({
      name: 'storageHost',
      implementation: 'real',
      registersFor: ['storage'],
    })
    const root = new Context()
    await storageHost.install(root, {
      stateRoot: '/unused',
      readTrusted: () => root,
      once: (_key, create) => create(),
    })
    expect(root.get('storageHost')).toBeInstanceOf(StorageHostService)
  })

  test('in a tree, the tampered host makes startup fail with exit 3 and the item in the error', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'app1-host-')))
    dirs.push(base)
    const tree = await loadStorageTree({
      stateRoot: base,
      storageRoot: join(base, 'storage'),
      directoryFile: join(base, 'storage', 'tenant-domains.json'),
      entryObjects: [storageHostModule({ catalog: () => tampered(storageCatalog()) })],
      withoutSessionStorage: true,
    })
    live.push(tree)
    expect(tree.result).toMatchObject({ kind: 'entry-failed', exitCode: 3, name: 'storageHost' })
    if (tree.result.kind !== 'entry-failed') return
    expect(String(tree.result.error)).toContain('material_digest_mismatch: participant session')
  })
})

describe('the registration lands on the storage row fiber (acceptance 5, DP1-C15 kind 2)', () => {
  test('with the real SqliteStoragePlugin: disposing the storage fiber withdraws the handle, and the report says disposed-before-stop', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'app1-fiber-')))
    dirs.push(base)
    const tree = await loadStorageTree({
      stateRoot: base,
      storageRoot: join(base, 'storage'),
      directoryFile: join(base, 'storage', 'tenant-domains.json'),
      withoutSessionStorage: true,
    })
    live.push(tree)
    if (tree.result.kind !== 'started')
      throw new Error(`not started: ${JSON.stringify(tree.result)}`)
    expect(tree.state('storage')).toMatchObject({ state: 'ACTIVE' })
    expect(tree.registry.liveRows()).toEqual([STORAGE])
    const storageFiber = tree.result.rows.find(row => row.id === STORAGE)?.fiber
    if (storageFiber === undefined) throw new Error('no storage fiber')
    await storageFiber.dispose()
    expect(tree.registry.liveRows()).toEqual([])
    const report = await runShutdown(tree.registry, expectedStorage, 3000, monotonicClock)
    expect(report.outcomes).toEqual([
      {
        row: STORAGE,
        phase: 'storage',
        result: { kind: 'disposed-before-stop', detail: expect.any(String) },
      },
    ])
    expect(report.overall).toBe('incomplete')
  })
})

describe('the close adapter (acceptance 5)', () => {
  test('every attached generation is closed by the assembly at stop, and report-settled reaches each one', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    const first = fakeControl(closed)
    host.attachControl(first)
    expect(registry.liveRows()).toEqual([STORAGE])
    const report = await runShutdown(registry, expectedStorage, 2000, monotonicClock)
    expect(report).toMatchObject({
      overall: 'settled',
      outcomes: [{ row: STORAGE, phase: 'storage', result: { kind: 'settled' } }],
    })
    expect(first.closes).toEqual(['assembly'])
    expect(first.settled).toBe(1)
  })

  test('a refused registration closes the control that was just saved and rethrows; stop still closes every saved control', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    const first = fakeControl(closed)
    host.attachControl(first)
    const second = fakeControl(closed)
    expect(() => host.attachControl(second)).toThrow(LifecycleRefusedError)
    expect(second.closes).toEqual(['assembly'])
    expect(first.closes).toEqual([])
    await runShutdown(registry, expectedStorage, 2000, monotonicClock)
    expect(first.closes).toEqual(['assembly'])
    expect(second.closes).toEqual(['assembly', 'assembly'])
    expect(second.settled).toBe(1)
  })

  test('a phase mismatch refuses the registration: the control is closed and the storage row is not registered', async () => {
    const mismatched = new Map<RowId, LifecyclePhase>([[STORAGE, 'business']])
    const { registry, host } = await hostOn(mismatched)
    const control = fakeControl(closed)
    expect(() => host.attachControl(control)).toThrow(/phase-mismatch/)
    expect(control.closes).toEqual(['assembly'])
    expect(registry.liveRows()).toEqual([])
  })

  test('a refused registration whose control rejects on close does not leave an unhandled rejection', async () => {
    const mismatched = new Map<RowId, LifecyclePhase>([[STORAGE, 'business']])
    const { host } = await hostOn(mismatched)
    const unhandled: unknown[] = []
    const record = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', record)
    try {
      const control = fakeControl(() => Promise.reject(new Error('close blew up')))
      expect(() => host.attachControl(control)).toThrow(/phase-mismatch/)
      expect(control.closes).toEqual(['assembly'])
      // 让拒绝有机会走到 unhandledRejection 钩子。
      await new Promise<void>(resolve => setTimeout(resolve, 50))
    } finally {
      process.off('unhandledRejection', record)
    }
    expect(unhandled).toEqual([])
  })

  test('an incomplete close answers incomplete with counts only, and a deadline answers incomplete without waiting', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    const residual = fakeControl(() =>
      Promise.resolve({
        kind: 'incomplete',
        residuals: [
          {
            domain: { scope: { kind: 'tenant', tenant: 'secret-tenant' }, transactionDomain: 'd' },
            workerRole: 'writer',
            workerGeneration: '1',
            leaseName: 'storage/1/writer/x/1',
            inFlight: [],
          },
        ],
      }),
    )
    host.attachControl(residual)
    const frozen = registry.freeze()
    const handle = frozen.live.get(STORAGE)?.handle
    if (handle === undefined) throw new Error('no handle')
    const result = await handle.stop(monotonicClock.now() + 2000)
    expect(result).toMatchObject({ kind: 'incomplete' })
    if (result.kind !== 'incomplete') return
    expect(result.detail).toContain('1')
    expect(result.detail).toContain('writer')
    expect(result.detail).not.toContain('secret-tenant')

    const { registry: other, host: hanging } = await hostOn(expectedStorage)
    hanging.attachControl(fakeControl(() => new Promise<StorageCloseResult>(() => {})))
    const slow = other.freeze().live.get(STORAGE)?.handle
    if (slow === undefined) throw new Error('no handle')
    const started = monotonicClock.now()
    const late = await slow.stop(monotonicClock.now() + 200)
    expect(monotonicClock.now() - started).toBeLessThan(1500)
    expect(late).toMatchObject({ kind: 'incomplete' })
  })

  test('the lease port admits before stop and refuses after it', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    host.attachControl(fakeControl(closed))
    const lease = host.closeLeases.admit('storage/1/writer/x/1')
    expect(typeof lease).toBe('object')
    host.closeLeases.release(lease)
    await runShutdown(registry, expectedStorage, 2000, monotonicClock)
    expect(() => host.closeLeases.admit('storage/1/writer/x/2')).toThrow()
  })
})
