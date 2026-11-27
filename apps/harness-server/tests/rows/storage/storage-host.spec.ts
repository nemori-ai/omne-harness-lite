import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test } from 'vitest'
import type {
  SqlMaterialCatalog,
  StorageCloseResult,
  StorageControl,
  StorageReadings,
} from '@omne-harness/sql-contract'
import { IDENTITY_PARTICIPANT } from '@omne-harness/identity-sql'
import { StorageHostService } from '@omne-harness/sql-contract/cordis'
import {
  StorageHostAdapter,
  catalogProblems,
  storageHost,
  storageHostModule,
} from '../../../src/entry/storage-host.ts'
import { S0AssemblyLifecycleService } from '../../../src/row.ts'
import { SupervisionRefused } from '@omne-harness/assembly-cordis/cordis'
import { rowSupervision } from '../../support/row-supervision.ts'
import {
  DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES,
  storageCatalog,
} from '../../../src/rows/storage/catalog.ts'
import { monotonicClock, runShutdown } from '../../../src/shutdown.ts'
import type { LifecyclePhase, RowId } from '../../../src/types.ts'
import { loadStorageTree, type LoadedTree } from './fixtures/tree.ts'

const STORAGE = 'storage' as RowId

type FakeControl = StorageControl & {
  readonly closes: Array<'assembly' | 'disposal'>
  settled: number
}

const NOTHING: StorageReadings = { reads: [], commits: [], participants: [], queries: [] }

function fakeControl(
  answer: () => Promise<StorageCloseResult>,
  counted: StorageReadings = NOTHING,
): FakeControl {
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
    readings: () => counted,
  }
  return control
}

const closed = (): Promise<StorageCloseResult> => Promise.resolve({ kind: 'closed' })

async function hostOn(_expected: ReadonlyMap<RowId, LifecyclePhase>) {
  const root = new Context()
  const registry = rowSupervision()
  await root.plugin(S0AssemblyLifecycleService, registry)
  const host = new StorageHostAdapter(root, storageCatalog())
  return { root, registry, host }
}

const expectedStorage = new Map<RowId, LifecyclePhase>([[STORAGE, 'storage']])

function tampered(catalog: SqlMaterialCatalog): SqlMaterialCatalog {
  const index = catalog.participants.findIndex(item => item.participant === 'session')
  const target = catalog.participants[index]
  if (target === undefined) throw new Error('catalog has no session participant')
  const participants = [...catalog.participants]
  participants[index] = { ...target, codeDigest: '0'.repeat(64) }
  return { ...catalog, participants }
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
    expect(catalog.participants.map(item => item.participant)).toContain(IDENTITY_PARTICIPANT)
    expect(catalog.declaredCombinations).toEqual({ tenant: null, system: null })
  })

  test('the release catalog carries the identity governance migration and read handler, within the read result limit', () => {
    const catalog = storageCatalog()
    const migrations = catalog.migrations
      .filter(item => item.owner === IDENTITY_PARTICIPANT)
      .map(item => [item.id, item.requires.map(ref => ref.id)])
    expect(migrations).toEqual([
      ['001-identity', []],
      ['002-governance', ['001-identity']],
      ['003-standing', ['002-governance']],
      ['004-preference', ['003-standing']],
    ])
    const governance = catalog.readHandlers.find(item => item.handler === 'identity.governance')
    expect(governance?.maxOutputBytes).toBe(1048576)
    for (const handler of catalog.readHandlers)
      expect(handler.maxOutputBytes, handler.handler).toBeLessThanOrEqual(
        DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES,
      )
  })

  test('the production host includes the governance and prepared Settings owners', async () => {
    const root = new Context()
    try {
      await storageHost.install(root, {
        stateRoot: '/unused',
        readTrusted: () => root,
        once: (_key, create) => create(),
      })
      const host = root.get('storageHost')
      if (host === undefined) throw new Error('production storageHost not published')
      const names = host.materials.participants.map(value => value.participant)
      expect(names).toContain('governance.activation')
      expect(names).toContain('assets.settings')
      expect(names).toContain('settings.catalog-terminal')
      expect(names).toContain('harness.session-permission-basis.mapped')
    } finally {
      await root.fiber.dispose()
    }
  })

  test('a tampered digest is listed by name and fails install', async () => {
    const problems = catalogProblems(tampered(storageCatalog()))
    expect(problems).toEqual(['material_digest_mismatch: participant session'])
    const module = storageHostModule({ catalog: () => tampered(storageCatalog()) })
    const root = new Context()
    await expect(
      module.install(root, {
        stateRoot: '/unused',
        readTrusted: () => root,
        once: (_key, create) => create(),
      }),
    ).rejects.toThrow(/material_digest_mismatch: participant session/)
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

describe('the registration lands on the storage row fiber', () => {
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

describe('the readings of the host', () => {
  test('are nothing before a provider is attached, and what the provider counted after', async () => {
    const { host } = await hostOn(expectedStorage)
    expect(host.readings()).toEqual(NOTHING)
    const counted: StorageReadings = {
      reads: [
        { domain: 'session', handler: 'read-history', read: 3, unavailable: 1, cancelled: 0 },
      ],
      commits: [
        {
          domain: 'session',
          committed: 2,
          recalled: 0,
          rolledBack: 0,
          unknown: 0,
          conflicted: 0,
          rejected: 0,
          bytes: 900,
        },
      ],
      participants: [{ domain: 'session', participant: 'session', committed: 2 }],
      queries: [{ domain: 'session', answered: 1, unknown: 0 }],
    }
    host.attachControl(fakeControl(closed, counted))
    expect(host.readings()).toEqual(counted)
  })

  test('add up, row by row, when the host kept more than one control', async () => {
    const { host } = await hostOn(expectedStorage)
    const one = {
      domain: 'session',
      handler: 'read-history',
      read: 3,
      unavailable: 0,
      cancelled: 0,
    }
    const other = {
      domain: 'identity',
      handler: 'read-standing',
      read: 5,
      unavailable: 0,
      cancelled: 2,
    }
    host.attachControl(fakeControl(closed, { ...NOTHING, reads: [one] }))
    expect(() =>
      host.attachControl(fakeControl(closed, { ...NOTHING, reads: [{ ...one, read: 4 }, other] })),
    ).toThrow(SupervisionRefused)
    expect(host.readings().reads).toEqual([{ ...one, read: 7 }, other])
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
    expect(() => host.attachControl(second)).toThrow(SupervisionRefused)
    expect(second.closes).toEqual(['assembly'])
    expect(first.closes).toEqual([])
    await runShutdown(registry, expectedStorage, 2000, monotonicClock)
    expect(first.closes).toEqual(['assembly'])
    expect(second.closes).toEqual(['assembly', 'assembly'])
    expect(second.settled).toBe(1)
  })

  test('a supervision that stops refuses the registration: the control is closed and the storage row is not registered', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    registry.enterStopping()
    const control = fakeControl(closed)
    expect(() => host.attachControl(control)).toThrow(/stopping/)
    expect(control.closes).toEqual(['assembly'])
    expect(registry.liveRows()).toEqual([])
  })

  test('a refused registration whose control rejects on close does not leave an unhandled rejection', async () => {
    const { registry, host } = await hostOn(expectedStorage)
    registry.enterStopping()
    const unhandled: unknown[] = []
    const record = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', record)
    try {
      const control = fakeControl(() => Promise.reject(new Error('close blew up')))
      expect(() => host.attachControl(control)).toThrow(/stopping/)
      expect(control.closes).toEqual(['assembly'])
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
