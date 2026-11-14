import { afterEach, describe, expect, it } from 'vitest'
import type { DurableEvidence, ToolState } from '@omne-harness/tool-contract'
import { invalidationOperation } from '../src/ledger-control.ts'
import { decideSettleLost } from '../src/ledger-lost.ts'
import { settleLostExecution } from '../src/lost-execution.ts'
import {
  committed,
  continued,
  FIRST,
  mintOf,
  putsOf,
  suspendedCall,
} from './resumption-decider-values.ts'
import {
  callId,
  evidence,
  ok,
  operationId,
  principalA,
  tenantA,
  textFactory,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  toStarting,
  writeContext,
  type StartHarness,
} from './start-values.ts'

afterEach(auditQueues)

const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
const CONTINUITY = evidence('state-lock')
const LOST = operationId('op-c1/start/lost')
const LOST_TERMINAL = { kind: 'failed', cause: 'runtime-lost' } as const
const LOST_EFFECT = { kind: 'unknown' } as const

const settle = (
  harness: StartHarness,
  continuity: DurableEvidence = CONTINUITY,
  operation = LOST,
) => harness.commands.settleLost({ ...ACCESS, operation, continuity })

const recovery = async (harness: StartHarness) => ok(await harness.commands.loadRecovery(ACCESS))

async function starting() {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  const start = await toStarting(harness, 'c1')
  return { harness, start }
}

async function live() {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  return harness
}

async function unknown() {
  const { harness, start } = await starting()
  ok(
    await harness.commands.recordStart({
      ...(await writeContext(harness, 'c1', 'op-c1/started')),
      invocation: start,
      outcome: { kind: 'unknown', diagnostic: 'the start answer was lost' },
    }),
  )
  return harness
}

function expectLost(state: ToolState) {
  expect(state).toMatchObject({
    phase: 'settled',
    terminal: LOST_TERMINAL,
    effect: LOST_EFFECT,
    execution: { kind: 'lost', evidence: CONTINUITY },
    delivery: { kind: 'pending' },
    wait: { kind: 'none' },
  })
  expect(state.queue.kind === 'released' ? state.queue.evidence : null).toEqual(CONTINUITY)
}

describe('settleLost: an execution that started and whose continuity is lost', () => {
  it.each([
    ['starting', async () => (await starting()).harness],
    ['live', live],
    ['unknown', unknown],
  ] as const)(
    'a call whose execution is %s settles failed, runtime-lost, effect unknown, and is not run again',
    async (kind, build) => {
      const harness = await build()
      expect((await recovery(harness)).state.execution.kind).toBe(kind)
      const attempts = harness.binding.attempts.length
      expectLost(ok(await settle(harness)))
      const after = await recovery(harness)
      expectLost(after.state)
      expect(after.tasks.map(task => task.kind).sort()).toEqual(
        after.state.timing.kind === 'unknown'
          ? ['clock', 'deliver', 'queue']
          : ['deliver', 'queue'],
      )
      expect(after.result).not.toBeNull()
      await harness.drive('c1')
      expect(await harness.released('c1')).toBe(true)
      expect(harness.binding.attempts).toHaveLength(attempts)
      if (after.state.phase !== 'settled') throw new Error('not settled')
      const page = ok(
        await harness.ledger.reads.result({ ...ACCESS, result: after.state.result, after: null }),
      )
      expect(page).toMatchObject({
        terminal: LOST_TERMINAL,
        effect: LOST_EFFECT,
        actualTerminal: null,
        relation: 'original',
      })
    },
  )

  it('the same operation with the same continuity answers the original state, and writes nothing more', async () => {
    const harness = await live()
    const first = ok(await settle(harness))
    const revision = (await recovery(harness)).state.revision
    expect(ok(await settle(harness))).toEqual(first)
    expect((await recovery(harness)).state.revision).toBe(revision)
  })

  it('the same operation with another continuity is a conflict', async () => {
    const harness = await live()
    ok(await settle(harness))
    expect(await settle(harness, evidence('another-lock'))).toEqual({
      failure: { kind: 'conflict', operation: LOST },
    })
  })

  it('a settled call answers a conflict that names the operation that settled it', async () => {
    const harness = await live()
    ok(await settle(harness))
    expect(await settle(harness, CONTINUITY, operationId('op-c1/start/lost-again'))).toEqual({
      failure: { kind: 'conflict', operation: LOST },
    })
  })

  it('a call that never started is refused, and stays as it was', async () => {
    const harness = startHarness()
    const admitted = await admitCall(harness, 'c1')
    expect(await settle(harness)).toEqual({
      failure: { kind: 'invalid', field: 'execution', reason: 'started-execution-required' },
    })
    expect((await recovery(harness)).state).toEqual(admitted)
  })

  it('a call the ledger does not hold is refused', async () => {
    const harness = startHarness()
    expect(await settle(harness)).toMatchObject({ failure: { kind: 'invalid', field: 'call' } })
  })

  it('a continuity that is no evidence is refused at the boundary', async () => {
    const harness = await live()
    expect(await settle(harness, { owner: 'o' } as never)).toMatchObject({
      failure: { kind: 'invalid', field: 'continuity.record' },
    })
    expect((await recovery(harness)).state.phase).toBe('running')
  })

  it('a call that is suspended on a wait is refused: no execution of it can be lost', async () => {
    const { harness } = await suspendedCall()
    expect((await recovery(harness)).state.execution.kind).toBe('suspended')
    expect(await settle(harness)).toEqual({
      failure: { kind: 'invalid', field: 'execution', reason: 'started-execution-required' },
    })
    expect((await recovery(harness)).state.phase).toBe('suspended')
  })

  it('a stop that was never dispatched to the lost execution is dropped with it, and its control is closed as already-ended in the same commit', async () => {
    const harness = await live()
    const stop = operationId('stop-c1')
    ok(await harness.commands.control({ ...ACCESS, operation: stop, intent: { kind: 'stop' } }))
    const before = await recovery(harness)
    expect(before.tasks.map(task => task.kind)).toContain('stop')
    expect(before.state.controls.map(control => control.progress.kind)).toEqual(['pending'])
    const settled = ok(await settle(harness))
    expectLost(settled)
    expect(settled.controls).toEqual([
      {
        ...before.state.controls[0],
        progress: { kind: 'already-ended', evidence: CONTINUITY },
      },
    ])
    const after = await recovery(harness)
    expect(after.tasks.map(task => task.kind)).not.toContain('stop')
    expect(after.state.controls).toEqual(settled.controls)
    expect(after.state.revision).toBe(settled.revision)
  })

  it('a lost resume segment closes the wait it was answering and owes the invalidation of its registration', async () => {
    const built = await suspendedCall({ resume: () => new Promise(() => {}) })
    const { snapshot } = await continued(built, { kind: 'declined' })
    expect(snapshot.call?.state.execution.kind).toBe('live')
    expect(snapshot.waits.get(FIRST)?.record.phase).toBe('responding')
    const command = { ...ACCESS, operation: LOST, continuity: CONTINUITY, inputDigest: 'digest' }
    const first = decideSettleLost(snapshot, command as never, null, mintOf(snapshot))
    if (first.kind !== 'prepare-synthetic') throw new Error('the decider did not ask for a result')
    expect(first.need).toMatchObject({ terminal: LOST_TERMINAL })
    const made = ok(textFactory().text('lost'))
    const prepared = {
      id: operationId('prepared-lost-c1'),
      operation: LOST,
      inputDigest: 'digest',
      need: first.need,
      basis: evidence('prepared-lost'),
      policy: null as never,
      state: { kind: 'prepared', value: { ...made, original: { kind: 'none' } } },
    }
    const decided = decideSettleLost(
      snapshot,
      command as never,
      prepared as never,
      mintOf(snapshot),
    )
    if (decided.kind === 'prepare-synthetic') throw new Error('the decider asked to prepare twice')
    const { writes, value } = committed(decided)
    expectLost(value)
    expect(putsOf(writes, 'wait')).toEqual([
      expect.objectContaining({
        wait: expect.objectContaining({
          record: expect.objectContaining({
            phase: 'closed',
            cause: 'terminal',
            evidence: value.source,
          }),
        }),
      }),
    ])
    expect(putsOf(writes, 'task').map(record => record['task'])).toContainEqual(
      expect.objectContaining({
        kind: 'wait-registration',
        action: 'invalidate',
        wait: FIRST,
        operation: invalidationOperation(FIRST),
        state: 'pending',
        evidence: value.source,
      }),
    )
  })

  it('the caller derives the operation from the start record of the lost execution', async () => {
    const harness = await live()
    const { start } = await recovery(harness)
    if (start === null) throw new Error('no start record')
    expectLost(ok(await settleLostExecution(harness.commands, ACCESS, start, CONTINUITY)))
    expect(ok(await settle(harness))).toMatchObject({ phase: 'settled' })
  })
})
