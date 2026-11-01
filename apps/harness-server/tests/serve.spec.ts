// `serve` 模式在同一进程里的行为（DP1-C3、C6、C9、C10、C11、C15、C17 的 once）：发行替身树、夹具行、装载前拒绝、
// 入口对象与占位规则、四个阶段的有序关闭。进程级（`dist/bin.js serve`）在 `serve-process.spec.ts`。
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { serveProfile } from '../src/profile.ts'
import type { S0Record } from '../src/run.ts'
import { rowIds } from '../src/s0/rows.ts'
import { identityClock } from '../src/entry/identity-clock.ts'
import type { EntryObjectModule } from '../src/types.ts'
import { serveOnce, type ServeRun } from './fixtures/serve/harness.ts'
import { freePort, operatorLayer } from './r9/support.ts'
import {
  failingEntryObject,
  fixturePlugins,
  fixtureRuntimeContextTrust,
  fixtureStorageHost,
  onceProbe,
  storageEvents,
  syntheticRow,
} from './fixtures/serve/index.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
type Row = { id: string; plugin: string; config?: unknown }
const release = JSON.parse(
  readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
) as { rows: Row[] }

const tree = (rows: readonly Row[]) => ({
  rows: rows.map(row => ({ id: row.id, plugin: row.plugin, config: row.config ?? {} })),
})
const ids = (records: readonly S0Record[]) => records.map(record => record['id'])
const seq = (run: ServeRun, action: string, row?: string) =>
  run
    .of('shutdown-step')
    .filter(r => r['action'] === action && (row === undefined || r['row'] === row))
    .map(r => r['seq'] as number)

beforeEach(() => {
  storageEvents.length = 0
})

describe('serve: the release tree of doubles (R1-1, DP1-C3)', () => {
  it('the release tree of 7 real, 1 contract-double and 41 s0-double rows loads, accepts, stops on request and exits 0', async () => {
    // The operator layer gives what the distribution file does not hold: absolute paths and the port.
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'serve-release-')))
    try {
      const port = await freePort()
      const run = await serveOnce({
        distribution: release,
        operator: operatorLayer({ storageRoot: join(base, 'storage'), port }),
        readinessTimeoutMs: 15_000,
        shutdownDeadlineMs: 5000,
      })
      expect(run.result.exitCode).toBe(0)
      expect(ids(run.of('tree'))).toEqual(rowIds)
      const implementations = new Map(run.of('tree').map(r => [r['id'], r['implementation']]))
      expect(
        [...implementations]
          .filter(([, kind]) => kind !== 's0-double')
          .map(([id, kind]) => `${String(id)}:${String(kind)}`),
      ).toEqual([
        'storage:real',
        'identity:real',
        'authorization:real',
        'session-storage:real',
        'session-provider:contract-double',
        'agent-adoptions:real',
        'adoption-sources:real',
        'server-entry:real',
      ])
      expect(run.of('row-state').every(r => r['state'] === 'ACTIVE')).toBe(true)
      expect(run.startup).toMatchObject({
        profile: 'real',
        scope: 'serving',
        accepting: true,
        outcome: 'ready',
        enabledRows: 49,
        barrierCalls: 1,
        implementations: { real: 7, 'contract-double': 1, 's0-double': 41 },
      })
      expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
      expect(run.stderr).toEqual(['serve: stop requested: test: startup seen'])
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('R1-1: only s0.assemblyLifecycle carries the s0. prefix', async () => {
    const run = await serveOnce({ distribution: release })
    const profile = serveProfile()
    const names = new Set<string>()
    for (const manifest of profile.stubManifests.values()) {
      for (const name of [...manifest.provides, ...manifest.injects]) names.add(name)
    }
    for (const visible of profile.visibility.values()) for (const name of visible) names.add(name)
    for (const record of run.of('tree')) {
      for (const name of (record['visible'] as string[] | undefined) ?? []) names.add(name)
    }
    for (const record of run.of('entry-object')) names.add(record['name'] as string)
    const prefixed = [...names].filter(name => name.startsWith('s0.'))
    expect(prefixed).toEqual(['s0.assemblyLifecycle'])
  })

  it('DP1-C11: placeholders are s0-double, the lifecycle is real, no value is printed', async () => {
    const run = await serveOnce({ distribution: release })
    const entries = run.of('entry-object')
    expect(entries.find(r => r['name'] === 's0.assemblyLifecycle')).toEqual({
      kind: 'entry-object',
      name: 's0.assemblyLifecycle',
      implementation: 'real',
      trusted: false,
    })
    expect(entries.find(r => r['name'] === 'principalIssuer')).toEqual({
      kind: 'entry-object',
      name: 'principalIssuer',
      implementation: 'real',
      trusted: true,
    })
    // 名字只被行提供的不是入口对象，即使这一次树里没有提供者。
    expect(entries.map(r => r['name'])).not.toContain('storage')
    for (const record of run.records) expect(Object.keys(record)).not.toContain('value')
  })

  it('an export of ./cordis without a declaration is unknown-plugin: exit 2', async () => {
    const run = await serveOnce({
      distribution: tree([{ id: 'storage', plugin: 'bare' }]),
      plugins: { stubPlugin, bare: { apply() {} } },
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toContain('unknown-plugin')
    expect(run.of('row-state')).toEqual([])
  })
})

describe('serve: fixture rows (R1-6, R1-3, R1-5)', () => {
  it('R1-6: the fixture storage row replaces the double, the identity double is ACTIVE, shutdown is ordered', async () => {
    const run = await serveOnce({
      distribution: tree([
        { id: 'storage', plugin: 'fixtureStorage' },
        { id: 'identity', plugin: 'stubPlugin' },
      ]),
      plugins: fixturePlugins,
      entryObjects: [fixtureStorageHost()],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.tree('storage')).toMatchObject({ plugin: 'fixtureStorage', implementation: 'real' })
    expect(run.state('identity')).toMatchObject({ state: 'ACTIVE' })
    expect(run.startup).toMatchObject({
      accepting: true,
      startedRows: ['storage'],
      implementations: { real: 1, 'contract-double': 0, 's0-double': 1 },
    })
    expect(run.of('entry-object').find(r => r['name'] === 'storageHost')).toMatchObject({
      implementation: 'real',
      trusted: true,
    })
    const report = run.of('shutdown-result')[0]!
    expect(report).toMatchObject({
      overall: 'settled',
      outcomes: [{ row: 'storage', phase: 'storage', result: { kind: 'settled' } }],
    })
    expect(seq(run, 'report-fixed')[0]).toBeLessThan(seq(run, 'report-settled-call', 'storage')[0]!)
    expect(storageEvents).toEqual(['start', 'close:assembly', 'report-settled'])
  })

  it('R1-6: without the fixture row the identity double stays PENDING and names storage', async () => {
    const run = await serveOnce({
      distribution: tree([{ id: 'identity', plugin: 'stubPlugin' }]),
      plugins: fixturePlugins,
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.state('identity')).toMatchObject({ state: 'PENDING', missing: ['storage'] })
    expect(run.startup).toMatchObject({ accepting: false, outcome: 'pending', barrierCalls: 0 })
  })

  it('R1-3: a real consumer whose provider the operator disabled is PENDING with the key, and gets no placeholder', async () => {
    const run = await serveOnce({
      distribution: tree([
        { id: 'storage', plugin: 'fixtureStorage' },
        { id: 'identity', plugin: 'fixtureIdentity' },
      ]),
      operator: { ops: [{ kind: 'disable', id: 'storage' }] },
      plugins: fixturePlugins,
      entryObjects: [fixtureStorageHost(), identityClock],
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.tree('storage')).toMatchObject({ disabled: true, source: 'operator' })
    expect(run.state('identity')).toMatchObject({ state: 'PENDING', missing: ['storage'] })
    expect(run.of('entry-object').map(r => r['name'])).not.toContain('storage')
    expect(run.startup['appliedRows']).toEqual([])
  })

  it('R1-3: a real row that injects an entry-object name the registry lacks is PENDING, with the module it is ACTIVE', async () => {
    const rows = tree([{ id: 'runtime-context', plugin: 'fixtureRuntimeContext' }])
    const without = await serveOnce({ distribution: rows, plugins: fixturePlugins })
    expect(without.result.exitCode).toBe(4)
    expect(without.state('runtime-context')).toMatchObject({
      state: 'PENDING',
      missing: ['runtimeContextTrust'],
    })
    expect(without.of('entry-object').map(r => r['name'])).not.toContain('runtimeContextTrust')

    const withModule = await serveOnce({
      distribution: rows,
      plugins: fixturePlugins,
      entryObjects: [fixtureRuntimeContextTrust],
    })
    expect(withModule.result.exitCode).toBe(0)
    expect(withModule.state('runtime-context')).toMatchObject({ state: 'ACTIVE' })
    expect(withModule.tree('runtime-context')).toMatchObject({ implementation: 'contract-double' })
    expect(withModule.of('entry-object')).toContainEqual({
      kind: 'entry-object',
      name: 'runtimeContextTrust',
      implementation: 'real',
      trusted: true,
    })
    expect(withModule.startup['implementations']).toEqual({
      real: 0,
      'contract-double': 1,
      's0-double': 0,
    })
  })

  it('R1-5: a new row joins with one entry in the plugin table and one row in the distribution', async () => {
    // 行目录 tests/fixtures/serve/rows/identity/ 之外，只有这两处各一条：`plugins`（./cordis 的替代）与发行层的一行。
    const run = await serveOnce({
      distribution: tree([
        { id: 'storage', plugin: 'fixtureStorage' },
        { id: 'identity', plugin: 'fixtureIdentity' },
        { id: 'authorization', plugin: 'stubPlugin' },
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fixtureIdentity: fixturePlugins.fixtureIdentity,
      },
      entryObjects: [fixtureStorageHost(), identityClock],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.tree('identity')).toMatchObject({
      plugin: 'fixtureIdentity',
      implementation: 'real',
    })
    expect(run.state('authorization')).toMatchObject({ state: 'ACTIVE' })
  })
})

describe('serve: checks before loading (DP1-C9, DP1-C10, DP1-C15, DP1-C11)', () => {
  it('DP1-C10: a real row that depends on a double provider is refused, exit 2, zero plugin bodies', async () => {
    const run = await serveOnce({
      distribution: tree([
        { id: 'storage', plugin: 'stubPlugin' },
        { id: 'identity', plugin: 'fixtureIdentity' },
      ]),
      plugins: fixturePlugins,
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toMatch(/identity.*storage.*s0-double/)
    expect(run.result.appliedRows).toEqual([])
    expect(run.of('row-state')).toEqual([])
  })

  it('DP1-C9: a real export bound to another row id is refused, exit 2', async () => {
    const run = await serveOnce({
      distribution: tree([{ id: 'storage', plugin: 'fixtureIdentity' }]),
      plugins: fixturePlugins,
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toMatch(/fixtureIdentity.*identity.*storage/)
    expect(run.result.appliedRows).toEqual([])
  })

  it('DP1-C15: via without a registering entry object is refused, exit 2', async () => {
    const rows = tree([{ id: 'storage', plugin: 'fixtureStorage' }])
    const absent = await serveOnce({
      distribution: rows,
      plugins: fixturePlugins,
      entryObjects: [],
    })
    expect(absent.result.exitCode).toBe(2)
    expect(absent.stderr.join('\n')).toMatch(/storage.*storageHost/)

    const notRegistering: EntryObjectModule = { ...fixtureStorageHost(), registersFor: [] }
    const unlisted = await serveOnce({
      distribution: rows,
      plugins: fixturePlugins,
      entryObjects: [notRegistering],
    })
    expect(unlisted.result.exitCode).toBe(2)
    expect(unlisted.result.appliedRows).toEqual([])
  })

  it('DP1-C11: two modules with one name are refused, exit 2', async () => {
    const run = await serveOnce({
      distribution: tree([{ id: 'runtime-context', plugin: 'fixtureRuntimeContext' }]),
      plugins: fixturePlugins,
      entryObjects: [fixtureRuntimeContextTrust, fixtureRuntimeContextTrust],
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toContain('runtimeContextTrust')
  })

  it('DP1-C11: an install that throws: exit 3, one stderr line, no row loads, the message stays off stdout', async () => {
    const run = await serveOnce({
      distribution: tree([{ id: 'runtime-context', plugin: 'fixtureRuntimeContext' }]),
      plugins: fixturePlugins,
      entryObjects: [failingEntryObject('runtimeContextTrust', 'secret-detail-7')],
    })
    expect(run.result.exitCode).toBe(3)
    expect(run.stderr).toContain('serve: entry-object runtimeContextTrust: install failed')
    expect(run.of('row-state')).toEqual([])
    expect(run.of('startup-result')).toEqual([])
    expect(run.result.appliedRows).toEqual([])
    expect(JSON.stringify(run.records)).not.toContain('secret-detail-7')
  })

  it('DP1-C17: once shares one object per key, and a second create for the same key fails the install', async () => {
    const rows = tree([{ id: 'runtime-context', plugin: 'fixtureRuntimeContext' }])
    const same: unknown[] = []
    const ok = await serveOnce({
      distribution: rows,
      plugins: fixturePlugins,
      entryObjects: [onceProbe('runtimeContextTrust', 'same', same)],
    })
    expect(ok.result.exitCode).toBe(0)
    expect(same).toHaveLength(2)
    expect(same[0]).toBe(same[1])

    const different: unknown[] = []
    const bad = await serveOnce({
      distribution: rows,
      plugins: fixturePlugins,
      entryObjects: [onceProbe('runtimeContextTrust', 'different', different)],
    })
    expect(bad.result.exitCode).toBe(3)
    expect(different).toHaveLength(1)
  })
})

describe('serve: the four phases with fixture rows (R1-4)', () => {
  it('start runs storage → composition → business → entry, stop runs the reverse, the report is fixed before assemblyReportSettled', async () => {
    const log: string[] = []
    const run = await serveOnce({
      distribution: tree([
        { id: 'fx-entry', plugin: 'fxEntry' },
        { id: 'fx-business', plugin: 'fxBusiness' },
        { id: 'fx-composition', plugin: 'fxComposition' },
        { id: 'storage', plugin: 'fixtureStorage' },
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fxEntry: syntheticRow({ id: 'fx-entry', phase: 'entry', log }),
        fxBusiness: syntheticRow({ id: 'fx-business', phase: 'business', log }),
        fxComposition: syntheticRow({ id: 'fx-composition', phase: 'composition', log }),
      },
      entryObjects: [fixtureStorageHost()],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.startup['startedRows']).toEqual([
      'storage',
      'fx-composition',
      'fx-business',
      'fx-entry',
    ])
    expect(log).toEqual([
      'start:fx-composition',
      'start:fx-business',
      'start:fx-entry',
      'stop:fx-entry',
      'stop:fx-business',
      'stop:fx-composition',
    ])
    const stops = run.of('shutdown-step').filter(r => r['action'] === 'stop-call')
    expect(stops.map(r => r['row'])).toEqual([
      'fx-entry',
      'fx-business',
      'fx-composition',
      'storage',
    ])
    expect(seq(run, 'report-fixed')[0]).toBeLessThan(seq(run, 'report-settled-call')[0]!)
    expect(storageEvents).toEqual(['start', 'close:assembly', 'report-settled'])
  })

  it('a body whose stop hangs is incomplete at D, the storage phase still runs, exit 5', async () => {
    const log: string[] = []
    const run = await serveOnce({
      distribution: tree([
        { id: 'fx-business', plugin: 'fxBusiness' },
        { id: 'storage', plugin: 'fixtureStorage' },
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fxBusiness: syntheticRow({ id: 'fx-business', phase: 'business', log, hangOnStop: true }),
      },
      entryObjects: [fixtureStorageHost()],
      shutdownDeadlineMs: 200,
    })
    expect(run.result.exitCode).toBe(5)
    expect(run.of('shutdown-result')[0]).toMatchObject({
      overall: 'incomplete',
      outcomes: [
        { row: 'fx-business', result: { kind: 'incomplete' } },
        { row: 'storage', result: { kind: 'settled' } },
      ],
    })
    expect(storageEvents).toContain('close:assembly')
  })
})
