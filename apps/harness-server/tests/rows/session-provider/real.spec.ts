// @module-tag slow
// The `session-provider` row as the real Session provider: `SessionProvider` of
// `@omne-harness/session-cordis` over the real storage rows. The row is ACTIVE, provides `session`,
// answers through the real faces (the double would answer differently), and registers one `business`
// shutdown handle that the ordered shutdown calls before it stops the storage rows.
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { runServe, type S0Record } from '../../../src/run.ts'
import { serveProfile } from '../../../src/profile.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import type { RowId } from '../../../src/types.ts'
import { accessPolicyRow, allowAll, providerConfig } from '../storage/fixtures/tree.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  storageRows,
  type LoadedTree,
} from '../session-fixtures/tree.ts'
import { stubPlugin } from '../../../src/cordis.ts'

const live: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const release of live.splice(0).reverse()) await release()
})

async function start(): Promise<LoadedTree> {
  const base = makeBase()
  live.push(() => base.release())
  const storage = storageRows(base)
  const tree = await loadTree({
    base,
    rows: [...storage.specs, declared(sessionProviderRealRow, { admission: 'none' })],
  })
  live.push(() => tree.dispose())
  return tree
}

describe('the real session-provider row: declaration', () => {
  const declaration = rowDeclarationOf(sessionProviderRealRow)

  it('is the real row `session-provider` with a body-carried `business` handle', () => {
    expect(declaration).toMatchObject({
      row: 'session-provider',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'business' },
    })
  })

  it('provides what the table row provides, injects the same four keys and carries the table phase `business`', () => {
    const table = serveProfile().stubManifests.get('session-provider' as RowId)
    if (declaration === undefined || table === undefined) throw new Error('unreachable')
    const sorted = (names: readonly string[]) => [...names].sort()
    expect(sorted(declaration.manifest.provides)).toEqual(sorted(table.provides))
    expect(sorted(declaration.manifest.injects)).toEqual(sorted(table.injects))
    expect(declaration.manifest.sameProviderGroup).toBe(table.sameProviderGroup)
    expect(table.phase).toBe('business')
    expect(declaration.manifest.phase).toBe('business')
  })
})

describe('the real session-provider row: on the real storage rows', () => {
  it('is ACTIVE and provides `session`', { timeout: 60_000 }, async () => {
    const tree = await start()
    expect(tree.allActive).toBe(true)
    expect(tree.state('session-provider')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service<SessionService>(sessionKey)).toBeDefined()
  })

  it(
    'answers through the real faces: no declared caller class is denied, named by the operation',
    { timeout: 60_000 },
    async () => {
      const tree = await start()
      const session = tree.service<SessionService>(sessionKey)!
      const refused = await session.work.readWork({
        principal: 'nobody',
        tenant: undefined,
        session: undefined,
      } as never)
      expect(refused).toEqual({ failure: { kind: 'denied', action: 'readWork' } })
    },
  )

  it(
    'registers exactly one `business` handle, and the ordered shutdown stops it before the storage rows',
    { timeout: 60_000 },
    async () => {
      const tree = await start()
      expect(tree.registry.liveRows().sort()).toEqual([
        'session-provider',
        'session-storage',
        'storage',
      ])
      const report = await tree.shutdown()
      expect(report.overall).toBe('settled')
      expect(report.outcomes.map(o => [o.row, o.phase, o.result.kind])).toEqual([
        ['session-provider', 'business', 'settled'],
        ['session-storage', 'composition', 'settled'],
        ['storage', 'storage', 'settled'],
      ])
    },
  )

  it(
    'without `sessionWorkPrincipals` stays PENDING and names the key',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const storage = storageRows(base)
      const tree = await loadTree({
        base,
        rows: [...storage.specs, declared(sessionProviderRealRow, {})],
        entryObjects: (await import('../session-fixtures/tree.ts')).BASE_ENTRY_OBJECTS.filter(
          module => module.name !== 'sessionWorkPrincipals',
        ),
        readinessTimeoutMs: 2000,
      })
      live.push(() => tree.dispose())
      expect(tree.state('session-provider')).toMatchObject({
        state: 'PENDING',
        missing: ['sessionWorkPrincipals'],
      })
    },
  )
})

describe('the real session-provider row: through the serve tree', () => {
  it(
    'starts ACTIVE over the release tree, and the ordered shutdown runs its `business` handle first',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const stop = new AbortController()
      const records: S0Record[] = []
      const result = await runServe({
        distribution: {
          rows: [
            { id: 'storage', plugin: 'storageRow', config: providerConfig(base.storageRoot) },
            { id: 'authorization', plugin: 'policyRow', config: {} },
            {
              id: 'session-storage',
              plugin: 'sessionStorageRow',
              config: {
                combinationVersion: 'session-composite/1',
                directoryFile: base.directoryFile,
                domainRule: 'organization-account/1',
              },
            },
            {
              id: 'session-provider',
              plugin: 'sessionProviderRealRow',
              config: { admission: 'none' },
            },
          ],
        },
        stateRoot: base.stateRoot,
        readinessTimeoutMs: 10_000,
        shutdownDeadlineMs: 5000,
        stop: stop.signal,
        plugins: {
          stubPlugin,
          storageRow,
          sessionStorageRow,
          policyRow: accessPolicyRow(allowAll).plugin,
          sessionProviderRealRow,
        },
        entryObjects: BASE_ENTRY_OBJECTS,
        write: record => {
          records.push(record)
          if (record.kind === 'startup-result') stop.abort('test: startup seen')
        },
        stderr: () => {},
      })
      const of = (kind: string) => records.filter(record => record.kind === kind)
      expect(result.exitCode).toBe(0)
      expect(of('startup-result')[0]).toMatchObject({ accepting: true, outcome: 'ready' })
      expect(of('row-state').map(record => [record['id'], record['state']])).toEqual([
        ['storage', 'ACTIVE'],
        ['authorization', 'ACTIVE'],
        ['session-storage', 'ACTIVE'],
        ['session-provider', 'ACTIVE'],
      ])
      const stops = of('shutdown-step')
        .filter(record => record['action'] === 'stop-call')
        .map(record => [record['row'], record['phase']])
      expect(stops).toEqual([
        ['session-provider', 'business'],
        ['session-storage', 'composition'],
        ['storage', 'storage'],
      ])
      expect(of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    },
  )
})
