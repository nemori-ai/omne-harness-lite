// The basis that releases the queue place of a settled call (P02): a place is freed on a proof that
// the execution physically ended or never started, never on the logical end alone. The basis
// exists only while the saved final, the call's start and execution and the preserved result agree
// piece by piece; a call whose records disagree in any piece keeps its place.
import { afterEach, describe, expect, it } from 'vitest'
import { snapshotOf } from '../src/ledger-decider.ts'
import { releaseBasisOf } from '../src/ledger-start.ts'
import { askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import { admitCall, auditQueues, startHarness, testAuthority } from './start-values.ts'
import { callId, evidence, ok, tenantA } from './runtime-values.ts'
import { settlementFixture } from './settlement-values.ts'

afterEach(auditQueues)

type Fixture = Awaited<ReturnType<typeof settlementFixture>>
type Records = Awaited<ReturnType<Fixture['records']>>
type Record = Records[number]

async function settled() {
  const f = await settlementFixture()
  ok(await f.preserve())
  const domain = { kind: 'call', tenant: tenantA, call: f.access.call } as const
  const read = await f.harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  const basis = (records: readonly Record[]) =>
    releaseBasisOf(snapshotOf(domain, { ...read, records: records as typeof read.records }))
  return { records: read.records as readonly Record[], basis }
}

function edit(
  records: readonly Record[],
  kind: Record['kind'],
  change: (record: never) => unknown,
) {
  return records.map(record =>
    record.kind === kind ? (change(record as never) as Record) : record,
  )
}
const call = (change: (call: Record & { kind: 'call' }) => object) => (record: never) => {
  const original = record as Record & { kind: 'call' }
  return { ...original, call: { ...original.call, ...change(original) } }
}
/** Edits the saved event of the final: `fact` of the event record is the event, its `fact` the final. */
const saved =
  (change: (event: Record & { kind: 'fact-event' }) => object, inside: 'event' | 'final') =>
  (record: never) => {
    const original = record as Record & { kind: 'fact-event' }
    if (original.fact.fact.kind !== 'final') return original
    const changes = change(original)
    return inside === 'event'
      ? { ...original, fact: { ...original.fact, ...changes } }
      : { ...original, fact: { ...original.fact, fact: { ...original.fact.fact, ...changes } } }
  }
const result = (change: (result: Record & { kind: 'result' }) => object) => (record: never) => {
  const original = record as Record & { kind: 'result' }
  return { ...original, result: { ...original.result, ...change(original) } }
}
const elsewhere = evidence('elsewhere')

describe('the basis of a call that settled with an ended execution', () => {
  it('is the proof of the physical end when the records agree', async () => {
    const { records, basis } = await settled()
    expect(basis(records)).toMatchObject({
      kind: 'physical-end',
      proof: { owner: expect.any(String), record: expect.any(String) },
    })
  })

  it('is none for a record of the call that is missing', async () => {
    const { basis } = await settled()
    expect(basis([])).toBe(null)
  })

  it.each([
    [
      'a call that is not settled',
      (r: Records) =>
        edit(
          r,
          'call',
          call(original => ({ state: { ...original.call.state, phase: 'running' } })),
        ),
    ],
    [
      'a start that is missing',
      (r: Records) =>
        edit(
          r,
          'call',
          call(() => ({ start: null })),
        ),
    ],
    [
      'an execution that does not belong to the start',
      (r: Records) =>
        edit(
          r,
          'call',
          call(original => ({ execution: { ...original.call.execution, generation: 'other' } })),
        ),
    ],
    [
      'a call that did not end its execution',
      (r: Records) =>
        edit(
          r,
          'call',
          call(original => ({
            state: { ...original.call.state, execution: { kind: 'never-started' } },
          })),
        ),
    ],
    [
      'a result that is not preserved',
      (r: Records) => r.filter(record => record.kind !== 'result'),
    ],
    [
      'a result in custody outside the execution',
      (r: Records) =>
        edit(
          r,
          'result',
          result(() => ({ custody: { kind: 'none' } })),
        ),
    ],
    [
      'a result of another final',
      (r: Records) =>
        edit(
          r,
          'result',
          result(original => ({ custody: { ...original.result.custody, final: elsewhere } })),
        ),
    ],
    [
      'a result over another raw output',
      (r: Records) =>
        edit(
          r,
          'result',
          result(original => ({
            custody: {
              ...original.result.custody,
              raw: {
                ...(original.result.custody as { raw: object }).raw,
                codec: { owner: 'x', name: 'x', revision: '1', digest: 'sha256:x' },
              },
            },
          })),
        ),
    ],
    [
      'a result value that differs from the saved final',
      (r: Records) =>
        edit(
          r,
          'result',
          result(() => ({
            value: {
              content: [],
              data: { kind: 'none' },
              original: { kind: 'none' },
              attachments: [],
            },
          })),
        ),
    ],
    [
      'a result terminal that differs from the saved final',
      (r: Records) =>
        edit(
          r,
          'result',
          result(() => ({ terminal: { kind: 'unavailable', reason: 'other' } })),
        ),
    ],
    [
      'a result effect that differs from the saved final',
      (r: Records) =>
        edit(
          r,
          'result',
          result(() => ({ effect: { kind: 'not-started' } })),
        ),
    ],
    [
      'a saved final that is missing',
      (r: Records) =>
        r.filter(record => record.kind !== 'fact-event' || record.fact.fact.kind !== 'final'),
    ],
    [
      'a saved fact that is not a final',
      (r: Records) =>
        edit(
          r,
          'fact-event',
          saved(() => ({ kind: 'process', blocks: [] }), 'final'),
        ),
    ],
    [
      'a saved final of another start',
      (r: Records) =>
        edit(
          r,
          'fact-event',
          saved(
            original => ({ start: { ...original.fact.start, operation: 'op-other/start' } }),
            'event',
          ),
        ),
    ],
    [
      'a saved final with another raw output',
      (r: Records) =>
        edit(
          r,
          'fact-event',
          saved(
            () => ({
              raw: {
                codec: { owner: 'x', name: 'x', revision: '1', digest: 'sha256:x' },
                custody: elsewhere,
                content: {
                  storage: 'memory',
                  key: 'k',
                  mediaType: 'x/y',
                  bytes: '1',
                  digest: 'sha256:k',
                },
              },
            }),
            'final',
          ),
        ),
    ],
  ])('is none for %s', async (_name, change) => {
    const { records, basis } = await settled()
    expect(basis(change(records))).toBe(null)
  })
})

describe('the basis of a call that settled while it was suspended', () => {
  async function suspendedAndSettled() {
    const authority = testAuthority()
    const checkpoint = checkpointBinding(authority, askingAuthor())
    const harness = startHarness({
      authority,
      bindingsPort: () => checkpoint.bindings,
      decisions: scriptedBridge('registers'),
      driverRetryDelayMs: 5,
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
      await new Promise(resolve => setTimeout(resolve, 2))
      quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
    }
    const domain = { kind: 'call', tenant: tenantA, call: callId('c1') } as const
    const read = await harness.memory.read(domain)
    if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
    const execution = (await harness.state('c1')).execution
    if (execution.kind !== 'suspended') throw new Error('c1 is not suspended')
    const settledCall = (record: (typeof read.records)[number]) =>
      record.kind === 'call'
        ? { ...record, call: { ...record.call, state: { ...record.call.state, phase: 'settled' } } }
        : record
    const basis = (records: readonly unknown[]) =>
      releaseBasisOf(snapshotOf(domain, { ...read, records: records as typeof read.records }))
    const committed = read.records.find(record => record.kind === 'suspension')
    if (committed === undefined || committed.kind !== 'suspension') throw new Error('no suspension')
    return {
      records: read.records.map(settledCall),
      basis,
      checkpoint: execution.checkpoint,
      committed,
    }
  }

  it('names the exclusion of the suspension whose checkpoint the settled state keeps', async () => {
    const { records, basis, checkpoint, committed } = await suspendedAndSettled()
    // Suspension records that come first and are not that one: a plan without its checkpoint, and a
    // commit of another checkpoint with its own exclusion.
    const plan = {
      ...committed,
      suspension: {
        ...committed.suspension,
        checkpoint: null,
        suspension: { ...committed.suspension.suspension, operation: 'op-plan/suspension' },
      },
    }
    const other = {
      ...committed,
      suspension: {
        ...committed.suspension,
        suspension: { ...committed.suspension.suspension, operation: 'op-other/suspension' },
        checkpoint: {
          ...committed.suspension.checkpoint,
          payload: evidence('other-checkpoint'),
          exclusion: evidence('other-exclusion'),
        },
      },
    }
    expect(basis([plan, other, ...records])).toMatchObject({
      kind: 'suspended-exclusion',
      checkpoint,
      exclusion: committed.suspension.checkpoint?.exclusion,
    })
    // Only a checkpoint that is not the settled one: none of the commits proves this call's exclusion.
    expect(basis([plan, other, ...records.filter(record => record.kind !== 'suspension')])).toBe(
      null,
    )
  })
})
