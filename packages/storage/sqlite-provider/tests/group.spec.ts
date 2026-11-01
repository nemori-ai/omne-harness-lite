// Group commit G2-P (SPEC 7.3, 7.4, 7.7.3, 7.7.4, 7.8, 4.5). The `seq` probe reads the file through
// its own connection while the group runs, so "rows seen by the probe" is the number of operations
// that are durable at that moment: 0 for the first operation of a group means they share a
// physical transaction.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import {
  createProvider,
  makeWorkspace,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'
import {
  buildGroupMaterials,
  domainFile,
  groupRegistration,
  op,
  readRows,
  seqCommand,
  sleep,
} from './group-support.ts'

let workspace: Workspace
let built: Built
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildGroupMaterials(workspace)
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

/** A registered domain. The collection window is wide, so operations issued together are in it. */
async function ready(
  config: Record<string, number> = {},
  materials: Built = built,
): Promise<Provider> {
  const provider = await createProvider(workspace, materials, { groupCollectMs: 150, ...config })
  providers.push(provider)
  const result = await provider.storage.registerCombination(groupRegistration(materials))
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
  return provider
}

const file = (): string => domainFile(workspace)

function reply(result: CommitResultV2, participant: string): unknown {
  if (result.kind !== 'committed') throw new Error(`expected committed, got ${result.kind}`)
  return (
    result.responses.find(entry => entry.participant === participant)?.reply as {
      response: unknown
    }
  ).response
}

/** What the probe of this result saw: durable rows and receipts at the time it ran. */
const probed = (result: CommitResultV2): { rows: number; receipts: number } =>
  reply(result, 'seq') as { rows: number; receipts: number }

const probeOp = (key: string): ReturnType<typeof op> =>
  op(built, key, [seqCommand({ mode: 'probe', file: file() })])

describe('C20: two real original operations share one physical commit', () => {
  it('the second operation runs before the first is durable, and both end up durable together', async () => {
    const { storage } = await ready()
    const [first, second] = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(probeOp('p')),
    ])
    expect(first.kind).toBe('committed')
    expect(second.kind).toBe('committed')
    expect(probed(second)).toEqual({ rows: 0, receipts: 0 })
    expect(readRows(workspace, 'select tag from t_seq')).toEqual([{ tag: 'a' }])
    expect(readRows(workspace, 'select count(*) n from _sql_receipt')).toEqual([{ n: 2 }])
  })

  it('a participant that the material marks singleton runs alone, so grouping is not a label', async () => {
    const singleton = await buildGroupMaterials(workspace, 'singleton')
    const { storage } = await ready({}, singleton)
    const [, second] = await Promise.all([
      storage.commit(op(singleton, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(op(singleton, 'p', [seqCommand({ mode: 'probe', file: file() })])),
    ])
    expect(probed(second)).toEqual({ rows: 1, receipts: 1 })
  })

  it('a caller that awaits the first commit before the second never shares a commit (DEP-1)', async () => {
    const { storage } = await ready()
    const first = await storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })]))
    expect(first.kind).toBe('committed')
    const second = await storage.commit(probeOp('p'))
    expect(probed(second)).toEqual({ rows: 1, receipts: 1 })
  })

  it('one operation with several participants saves facts, responses and receipt in one commit (G1)', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      op(built, 'a', [
        { participant: 'echo', facts: { mode: 'probe', file: file() } },
        seqCommand({ tag: 'a' }),
      ]),
    )
    expect(result.kind).toBe('committed')
    expect(reply(result, 'echo')).toEqual({ saw: '1', rows: 0 })
    expect(readRows(workspace, 'select count(*) n from t_seq')).toEqual([{ n: 1 }])
  })
})

describe('group boundaries (SPEC 7.3)', () => {
  it('closes the group at groupMaxOperations', async () => {
    const { storage } = await ready({ groupMaxOperations: 2 })
    const results = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(op(built, 'b', [seqCommand({ tag: 'b' })])),
      storage.commit(probeOp('p')),
    ])
    expect(probed(results[2] as CommitResultV2)).toEqual({ rows: 2, receipts: 2 })
  })

  it('stops starting operations after groupMaxExecutionSliceMs and keeps the rest for the next group', async () => {
    const { storage } = await ready({ groupMaxExecutionSliceMs: 1 })
    const results = await Promise.all([
      storage.commit(op(built, 'slow', [seqCommand({ mode: 'hang', ms: 40 })])),
      storage.commit(probeOp('p')),
    ])
    expect(results.map(result => result.kind)).toEqual(['committed', 'committed'])
    expect(probed(results[1] as CommitResultV2)).toEqual({ rows: 1, receipts: 1 })
  })

  it('closes the group before it would pass groupMaxInputBytes', async () => {
    const { storage } = await ready({
      maxCommandBytes: 1000,
      maxRequestBytes: 1000,
      groupMaxInputBytes: 1000,
    })
    const big = 'x'.repeat(400)
    const results = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: big })])),
      storage.commit(op(built, 'b', [seqCommand({ mode: 'probe', file: file(), pad: big })])),
    ])
    expect(results.map(result => result.kind)).toEqual(['committed', 'committed'])
    expect(probed(results[1] as CommitResultV2).rows).toBe(1)
  })

  it('closes the group before it would pass groupMaxResponseReservationBytes', async () => {
    const { storage } = await ready({ groupMaxResponseReservationBytes: 1048576 })
    const [, second] = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(probeOp('p')),
    ])
    expect(probed(second).rows).toBe(1)
  })

  it('does not pass a query: operations on both sides of it are in different groups', async () => {
    const { storage } = await ready()
    const first = op(built, 'a', [seqCommand({ tag: 'a' })])
    const pendingFirst = storage.commit(first)
    const queried = storage.query(first.identity)
    await sleep(40)
    const second = await storage.commit(probeOp('p'))
    expect((await pendingFirst).kind).toBe('committed')
    expect((await queried).kind).toBe('committed')
    expect(probed(second)).toEqual({ rows: 1, receipts: 1 })
  })

  it('a non-groupable operation is its own group', async () => {
    const { storage } = await ready()
    const results = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(op(built, 'f', [{ participant: 'fk', facts: { mode: 'parent', id: 1 } }])),
      storage.commit(probeOp('p')),
    ])
    expect(results.map(result => result.kind)).toEqual(['committed', 'committed', 'committed'])
    expect(probed(results[2] as CommitResultV2)).toEqual({ rows: 1, receipts: 2 })
  })
})

describe('C21: grouping eligibility', () => {
  const child = (key: string): ReturnType<typeof op> =>
    op(built, key, [{ participant: 'fk', facts: { mode: 'child', parent: 7 } }])
  const parent = (key: string): ReturnType<typeof op> =>
    op(built, key, [{ participant: 'fk', facts: { mode: 'parent', id: 7 } }])

  it('FK-1: a deferred foreign key violation is not repaired by the next operation of the group', async () => {
    const { storage } = await ready()
    const results = await Promise.all([
      storage.commit(child('child')),
      storage.commit(parent('parent')),
    ])
    expect(results[1].kind).toBe('committed')
    expect(readRows(workspace, 'select count(*) n from t_child')).toEqual([{ n: 0 }])
    expect(readRows(workspace, 'select id from t_parent')).toEqual([{ id: 7 }])
    expect(readRows(workspace, 'select operation_key from _sql_receipt')).toEqual([
      { operation_key: 'parent' },
    ])
  })
})

describe('C18: results are published after the commit is durable', () => {
  it('a commit that fails at the end (deferred foreign key) is unknown, never committed', async () => {
    const { storage } = await ready()
    const request = op(built, 'child', [{ participant: 'fk', facts: { mode: 'child', parent: 7 } }])
    const result = await storage.commit(request)
    expect(result.kind).toBe('unknown')
    expect(readRows(workspace, 'select count(*) n from _sql_receipt')).toEqual([{ n: 0 }])
    expect((await storage.query(request.identity)).kind).toBe('not_committed')
  })
})

describe('waiters of one identity inside a group (SPEC 7.7.3)', () => {
  it('a same-identity call gets the original receipt, a different input gets identity_conflict, nothing runs twice', async () => {
    const { storage } = await ready()
    const [first, same, other] = await Promise.all([
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(op(built, 'a', [seqCommand({ tag: 'a' })])),
      storage.commit(op(built, 'a', [seqCommand({ tag: 'other' })])),
    ])
    expect(first.kind).toBe('committed')
    expect(same).toEqual(first)
    expect(other).toEqual({ kind: 'identity_conflict', identity: first.identity, existing: first })
    expect(readRows(workspace, 'select tag from t_seq')).toEqual([{ tag: 'a' }])
  })

  it('when the original ends unknown, every waiter is unknown and none becomes the new winner', async () => {
    const { storage } = await ready()
    const child = (tag: string): ReturnType<typeof op> =>
      op(built, 'c', [{ participant: 'fk', facts: { mode: 'child', parent: 7, tag } }])
    const results = await Promise.all([
      storage.commit(child('one')),
      storage.commit(child('one')),
      storage.commit(child('two')),
    ])
    expect(results.map(result => result.kind)).toEqual(['unknown', 'unknown', 'unknown'])
    expect(readRows(workspace, 'select count(*) n from t_child')).toEqual([{ n: 0 }])
  })

  it('an identity that already has a durable receipt is answered without running, inside a group', async () => {
    const { storage } = await ready()
    const again = op(built, 'a', [seqCommand({ tag: 'a' })])
    const original = await storage.commit(again)
    const [repeated, fresh] = await Promise.all([
      storage.commit(again),
      storage.commit(op(built, 'b', [seqCommand({ tag: 'b' })])),
    ])
    expect(repeated).toEqual(original)
    expect(fresh.kind).toBe('committed')
    expect(readRows(workspace, 'select tag from t_seq order by n')).toEqual([
      { tag: 'a' },
      { tag: 'b' },
    ])
  })
})

describe('C03: dependency order inside a group', () => {
  it('every operation runs its participants in dependency order, whatever the order of the commands', async () => {
    const { storage } = await ready()
    const results = await Promise.all([
      storage.commit(
        op(built, 'a', [{ participant: 'echo', facts: {} }, seqCommand({ tag: 'a' })]),
      ),
      storage.commit(
        op(built, 'b', [{ participant: 'echo', facts: {} }, seqCommand({ tag: 'b' })]),
      ),
    ])
    for (const result of results) {
      expect(result.kind).toBe('committed')
      if (result.kind === 'committed')
        expect(result.responses.map(entry => entry.participant)).toEqual(['seq', 'echo'])
    }
    expect(readRows(workspace, 'select n from t_echo order by n')).toEqual([{ n: '1' }, { n: '2' }])
  })
})
