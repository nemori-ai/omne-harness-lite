import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test } from 'vitest'
import { disposeTree, startTree, type StartResult } from '../src/loader.ts'
import { mapFiberState } from '../src/readiness.ts'
import { createTrust } from '../src/trust.ts'
import { createStubPlugin, type StubEvent } from '../src/s0/stub-plugin.ts'
import type { RowId, RowManifest, RowState, ServiceName, TreeRow } from '../src/types.ts'

type RowDecl = Readonly<{
  id: string
  provides?: readonly ServiceName[]
  injects?: readonly ServiceName[]
  config?: unknown
}>

const live: Array<{ root: Context; result: StartResult }> = []

afterEach(async () => {
  while (live.length > 0) {
    const finished = live.pop()!
    if (finished.result.kind === 'started') await disposeTree(finished.root, finished.result.rows)
  }
})

async function run(
  rows: readonly RowDecl[],
  options: { timeoutMs?: number; hold?: Promise<void> } = {},
) {
  const events: StubEvent[] = []
  const root = new Context()
  let barrierCalls = 0
  const specs = rows.map(decl => {
    const id = decl.id as RowId
    const manifest: RowManifest = {
      provides: decl.provides ?? [],
      injects: decl.injects ?? [],
      phase: null,
      sameProviderGroup: null,
    }
    const row: TreeRow = { id, plugin: 'stub', config: decl.config ?? {}, source: 'distribution' }
    return {
      row,
      manifest,
      plugin: createStubPlugin({
        id,
        manifest,
        hooks: { observe: e => events.push(e), ...(options.hold ? { hold: options.hold } : {}) },
      }),
    }
  })
  const result = await startTree({
    root,
    trust: createTrust([], new Map()),
    rows: specs,
    entryObjects: [],
    readinessTimeoutMs: options.timeoutMs ?? 500,
    barrier: () => {
      barrierCalls += 1
    },
  })
  live.push({ root, result })
  if (result.kind !== 'started') throw new Error('tree was rejected')
  const byId = (id: string): RowState => {
    const found = result.report.rows.find(r => r.id === id)
    if (!found) throw new Error(`no row ${id}`)
    return found
  }
  const applied = (id: string) => events.filter(e => e.kind === 'applied' && e.row === id).length
  return { report: result.report, byId, applied, barrierCalls: () => barrierCalls }
}

const CHAIN: readonly RowDecl[] = [
  { id: 'storage', provides: ['s0.storage'] },
  { id: 'identity', provides: ['s0.identity'], injects: ['s0.storage'] },
  { id: 'agent-host', injects: ['s0.identity'] },
]

describe('startup readiness (spec 5.2, section 8)', () => {
  test('all rows ACTIVE: barrier once, exit 0', async () => {
    const r = await run(CHAIN)
    expect(r.report.rows.map(x => x.state)).toEqual(['ACTIVE', 'ACTIVE', 'ACTIVE'])
    expect(r.report.outcome).toBe('ready')
    expect(r.report.exitCode).toBe(0)
    expect(r.barrierCalls()).toBe(1)
  })

  test('a row loaded before its provider becomes ACTIVE once the provider arrives', async () => {
    const r = await run([CHAIN[2]!, CHAIN[1]!, CHAIN[0]!])
    expect(r.report.outcome).toBe('ready')
    expect(r.barrierCalls()).toBe(1)
  })

  test('missing storage: direct gap and blocked chain are reported apart, nothing FAILED', async () => {
    const r = await run(CHAIN.filter(row => row.id !== 'storage'))
    const identity = r.byId('identity')
    expect(identity.state).toBe('PENDING')
    expect(identity.missing).toEqual(['s0.storage'])
    expect(identity.blockedBy).toEqual([])

    const host = r.byId('agent-host')
    expect(host.state).toBe('PENDING')
    expect(host.blockedBy).toEqual(['identity'])

    expect(r.report.rows.some(x => x.state === 'FAILED')).toBe(false)
    expect(r.applied('identity')).toBe(0)
    expect(r.applied('agent-host')).toBe(0)
    expect(r.report.outcome).toBe('pending')
    expect(r.report.exitCode).toBe(4)
    expect(r.barrierCalls()).toBe(0)
  })

  test('plugin failure: FAILED keeps its tag, dependents are PENDING, both are reported, exit 3', async () => {
    const r = await run([
      { id: 'storage', provides: ['s0.storage'], config: { failOnApply: 'boom-tag' } },
      CHAIN[1]!,
      CHAIN[2]!,
    ])
    const storage = r.byId('storage')
    expect(storage.state).toBe('FAILED')
    expect(storage.error?.tag).toBe('boom-tag')
    expect(r.byId('identity').state).toBe('PENDING')
    expect(r.byId('identity').blockedBy).toEqual(['storage'])
    expect(r.report.outcome).toBe('failed')
    expect(r.report.exitCode).toBe(3)
    expect(r.barrierCalls()).toBe(0)
  })

  test('G-1 a construction check fails at startup with its tag', async () => {
    const r = await run([
      { id: 'agent-host', config: { constructionCheck: 'joint-commits-mismatch' } },
    ])
    expect(r.byId('agent-host').state).toBe('FAILED')
    expect(r.byId('agent-host').error?.tag).toBe('joint-commits-mismatch')
    expect(r.report.exitCode).toBe(3)
    expect(r.barrierCalls()).toBe(0)
  })

  test('G-2 an unknown mapping selection fails server-entry at startup', async () => {
    const r = await run([
      { id: 'agent-adoptions', provides: ['s0.mappings'], config: { mappingIds: ['m1', 'm2'] } },
      {
        id: 'server-entry',
        injects: ['s0.mappings'],
        config: {
          expectIn: {
            service: 's0.mappings',
            field: 'mappingIds',
            value: 'm9',
            tag: 'mapping-selection-unknown',
          },
        },
      },
    ])
    expect(r.byId('agent-adoptions').state).toBe('ACTIVE')
    expect(r.byId('server-entry').state).toBe('FAILED')
    expect(r.byId('server-entry').error?.tag).toBe('mapping-selection-unknown')
    expect(r.report.exitCode).toBe(3)
    expect(r.barrierCalls()).toBe(0)

    const ok = await run([
      { id: 'agent-adoptions', provides: ['s0.mappings'], config: { mappingIds: ['m1', 'm2'] } },
      {
        id: 'server-entry',
        injects: ['s0.mappings'],
        config: {
          expectIn: {
            service: 's0.mappings',
            field: 'mappingIds',
            value: 'm2',
            tag: 'mapping-selection-unknown',
          },
        },
      },
    ])
    expect(ok.report.outcome).toBe('ready')
  })

  test('the plugin own schema rejects a bad value as FAILED, not as a silent default', async () => {
    const r = await run([{ id: 'agent-host', config: { failOnApply: 5 } }])
    expect(r.byId('agent-host').state).toBe('FAILED')
    expect(r.report.exitCode).toBe(3)
  })

  test('LOADING at the deadline is readiness-timeout, never rewritten to FAILED or PENDING', async () => {
    let release!: () => void
    const hold = new Promise<void>(resolve => {
      release = resolve
    })
    const r = await run(
      [{ id: 'storage', provides: ['s0.storage'], config: { holdApply: true } }, CHAIN[1]!],
      { timeoutMs: 50, hold },
    )
    release()
    expect(r.byId('storage').state).toBe('LOADING')
    expect(r.byId('identity').state).toBe('PENDING')
    expect(r.report.outcome).toBe('readiness-timeout')
    expect(r.report.exitCode).toBe(4)
    expect(r.barrierCalls()).toBe(0)
  })

  test('FAILED and PENDING together: the overall outcome is failed', async () => {
    const r = await run([
      { id: 'a', config: { failOnApply: 't' } },
      { id: 'b', injects: ['s0.absent'] },
    ])
    expect(r.byId('a').state).toBe('FAILED')
    expect(r.byId('b').state).toBe('PENDING')
    expect(r.byId('b').missing).toEqual(['s0.absent'])
    expect(r.report.outcome).toBe('failed')
  })
})

describe('fiber state mapping', () => {
  test('maps every Cordis 4.0.4 FiberState and refuses an unknown number', () => {
    expect([0, 1, 2, 3, 4, 5].map(mapFiberState)).toEqual([
      'PENDING',
      'LOADING',
      'ACTIVE',
      'FAILED',
      'DISPOSED',
      'DISPOSED',
    ])
    expect(() => mapFiberState(6)).toThrow(/unknown fiber state/)
  })
})
