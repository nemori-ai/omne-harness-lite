import { describe, expect, it } from 'vitest'
import { fakeClock, tenantOf } from '@omne-harness/canvas/testing'
import { MAIN_CANVAS } from '@omne-harness/canvas-contract'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSqlCanvasStore, type CanvasSqlOptions } from '../../src/storage/store.ts'
import { POLICY } from '../fixture.ts'

type Read = Parameters<SqlStorage['read']>[0]
type Commit = Parameters<SqlStorage['commit']>[0]

const BINDING = { transactionDomain: 'canvas-t1', combinationVersion: 'c-3', manifestDigest: 'm-9' }
const TENANT = tenantOf('tenant-1')
const STAMP = {
  canvas: MAIN_CANVAS,
  by: { kind: 'human' },
  when: fakeClock().now(),
  rules: { sheet: POLICY.sheet, footprint: POLICY.footprint, placed: 5, away: 5 },
} as const

/** A storage that answers each read and commit as it is told, and keeps what it was given. */
function storage(answers: {
  read?: (input: Read) => unknown
  commit?: (input: Commit) => unknown
}) {
  const reads: Read[] = []
  const commits: Commit[] = []
  const given = {
    read: async (input: Read) => {
      reads.push(input)
      return (answers.read ?? (({ requestKey }) => ({ kind: 'read', requestKey, output: 'out' })))(
        input,
      )
    },
    commit: async (input: Commit) => {
      commits.push(input)
      return (answers.commit ?? (() => ({ kind: 'unknown' })))(input)
    },
  } as unknown as Pick<SqlStorage, 'read' | 'commit'>
  return { given, reads, commits }
}

const over = (
  s: ReturnType<typeof storage>,
  bind: CanvasSqlOptions['bind'] = async () => BINDING,
) => createSqlCanvasStore({ storage: s.given, bind })

describe('a read of the SQL store', () => {
  it('asks the handler for the read, in the domain of the tenant, and answers what it read', async () => {
    const s = storage({})
    const store = over(s)
    const reference = { kind: 'media.object', ref: 'a' }
    expect(await store.look(TENANT, MAIN_CANVAS)).toEqual({ kind: 'read', value: 'out' })
    await store.away(TENANT, MAIN_CANVAS, { limit: 3 })
    await store.away(TENANT, MAIN_CANVAS, { limit: 3, before: 9 })
    await store.placing(TENANT, MAIN_CANVAS, reference)
    expect(s.reads.map(read => read.input)).toEqual([
      { read: 'look', tenant: 'tenant-1', canvas: 'main' },
      { read: 'away', tenant: 'tenant-1', canvas: 'main', limit: 3 },
      { read: 'away', tenant: 'tenant-1', canvas: 'main', limit: 3, before: 9 },
      { read: 'placing', tenant: 'tenant-1', canvas: 'main', reference },
    ])
    for (const read of s.reads)
      expect(read).toMatchObject({
        domain: { scope: { kind: 'tenant', tenant: 'tenant-1' }, transactionDomain: 'canvas-t1' },
        handler: 'canvas.arrangement',
        protocol: 'canvas-persistence/1',
      })
  })

  it.each([
    ['the storage answers no read', () => ({ kind: 'unavailable', requestKey: null })],
    ['the read answers another request', () => ({ kind: 'read', requestKey: 'other', output: 1 })],
    [
      'the read of this request was cancelled',
      ({ requestKey }: Read) => ({ kind: 'cancelled', requestKey }),
    ],
    [
      'the storage throws',
      () => {
        throw new Error('the reader is gone')
      },
    ],
  ])('answers unavailable when %s', async (_name, read) => {
    expect(await over(storage({ read })).look(TENANT, MAIN_CANVAS)).toEqual({
      kind: 'unavailable',
    })
  })

  it('answers unavailable for a tenant with no storage domain, and does not read', async () => {
    const s = storage({})
    expect(await over(s, async () => null).look(TENANT, MAIN_CANVAS)).toEqual({
      kind: 'unavailable',
    })
    expect(s.reads).toEqual([])
  })
})

describe('a commit of the SQL store', () => {
  it('runs the script of the write for the tenant, in its domain and combination, never recalled', async () => {
    const s = storage({})
    await over(s).take(TENANT, { ...STAMP, items: [] })
    expect(s.commits).toHaveLength(1)
    expect(s.commits[0]).toMatchObject({
      identity: {
        scope: { kind: 'tenant', tenant: 'tenant-1' },
        transactionDomain: 'canvas-t1',
        operation: 'canvas.take',
        recall: 'never',
      },
      combinationVersion: 'c-3',
      manifestDigest: 'm-9',
      commands: [
        {
          participant: 'canvas.persistence',
          facts: { script: 'take', tenant: 'tenant-1', command: { ...STAMP, items: [] } },
        },
      ],
    })
  })

  it('runs a fresh operation each time, so that a write sent again is a write of its own', async () => {
    const s = storage({})
    const store = over(s)
    await store.take(TENANT, { ...STAMP, items: [] })
    await store.take(TENANT, { ...STAMP, items: [] })
    const [first, second] = s.commits.map(commit => commit.identity.operationKey)
    expect(first).not.toBe(second)
  })

  it.each([
    ['place', (store: ReturnType<typeof over>) => store.place(TENANT, { ...STAMP } as never)],
    ['arrange', (store: ReturnType<typeof over>) => store.arrange(TENANT, { ...STAMP } as never)],
    ['take', (store: ReturnType<typeof over>) => store.take(TENANT, { ...STAMP } as never)],
    ['pile', (store: ReturnType<typeof over>) => store.pile(TENANT, { ...STAMP } as never)],
    ['scatter', (store: ReturnType<typeof over>) => store.scatter(TENANT, { ...STAMP } as never)],
    ['lock', (store: ReturnType<typeof over>) => store.lock(TENANT, { ...STAMP } as never)],
  ])('names the script %s', async (script, write) => {
    const s = storage({})
    await write(over(s))
    expect(s.commits[0]).toMatchObject({
      identity: { operation: `canvas.${script}` },
      commands: [{ facts: { script } }],
    })
  })

  it('answers what the script answered when the commit is committed', async () => {
    const committed = () => ({
      kind: 'committed',
      responses: [{ reply: { kind: 'participated', response: { kind: 'no-change' } } }],
    })
    expect(
      await over(storage({ commit: committed })).take(TENANT, { ...STAMP, items: [] }),
    ).toEqual({ kind: 'committed', value: { kind: 'no-change' } })
  })

  it.each([
    ['rolled back', () => ({ kind: 'rolled_back' }), { kind: 'rolled-back' }],
    ['in an identity conflict', () => ({ kind: 'identity_conflict' }), { kind: 'rolled-back' }],
    ['not known', () => ({ kind: 'unknown' }), { kind: 'unknown' }],
    [
      'lost to a throw',
      () => {
        throw new Error('the writer is gone')
      },
      { kind: 'unknown' },
    ],
  ])('answers a commit %s as such', async (_name, commit, answer) => {
    expect(await over(storage({ commit })).take(TENANT, { ...STAMP, items: [] })).toEqual(answer)
  })

  it('rolls back for a tenant with no storage domain, and does not commit', async () => {
    const s = storage({})
    expect(await over(s, async () => null).take(TENANT, { ...STAMP, items: [] })).toEqual({
      kind: 'rolled-back',
    })
    expect(s.commits).toEqual([])
  })
})
