// A run that cannot go on (a closing node refused for good) retains the execution slot and is
// reported once. A determinate node failure with healthy settlement dependencies reaches Journal
// ended before the provider releases its slot. An unavailable write is a wait, not a stop.
import { describe, expect, it } from 'vitest'
import type { AgentRunFailed } from '@omne-harness/agent'
import type { AgentRegistrationHandle, Failure } from '@omne-harness/agent-contract'
import { decodeAgentRegistrationId } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  evidence,
  execution,
  failure,
  instance,
  ok,
  operation,
  tenantA,
  type Principal,
} from './journal-support.ts'
import {
  alice,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  shown,
  stoppedAt,
} from './loop-support.ts'

// A definite refusal: the same write gets it again, so the run cannot wait it out.
const JOURNAL_REFUSED: Failure = { kind: 'invalid', field: 'storage', reason: 'command_limit' }

const JOURNAL_FULL: Failure = {
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic: 'storage rejected the commit: queue_full',
}

/** A registration handle that counts withdrawals and answers withdrawn. */
function registration() {
  const withdrawals: string[] = []
  const id = decodeAgentRegistrationId('registration-1')
  if ('failure' in id) throw new Error('registration id')
  const handle: AgentRegistrationHandle<Principal> = {
    instance: instance(),
    report: () => {},
    withdraw(input) {
      withdrawals.push(input.operation)
      return Promise.resolve(succeed({ registration: id.ok, state: 'withdrawn' }))
    },
  }
  return { handle, withdrawals }
}

/**
 * An assembly whose Journal refuses for good every commit of the I0 node and every tryFinish,
 * with a report receiver. I0's refusal is a node fault, so the run settles towards F3; F3 is a
 * closing node, and a terminal refused for good is a run that cannot go on (SPEC 运行失败).
 */
async function stoppingAtF3(failed: (event: AgentRunFailed) => void) {
  const host = registration()
  const assembly = await loopAssembly(
    [execution(), execution('exec-2')],
    d => ({
      ...d,
      registration: host.handle,
      journal: {
        ...d.journal,
        commit: input =>
          input.operation.startsWith('I0/')
            ? Promise.resolve(fail(JOURNAL_REFUSED))
            : d.journal.commit(input),
        tryFinish: () => Promise.resolve(fail(JOURNAL_REFUSED)),
      },
    }),
    undefined,
    undefined,
    { failed },
  )
  return { assembly, host }
}

const quiesceOf = (assembly: Awaited<ReturnType<typeof stoppingAtF3>>['assembly']) =>
  assembly.provider.control.quiesce({
    ...alice,
    operation: operation('quiesce-1'),
    reason: evidence('stop'),
  })

describe('a run that stops on a node failure', () => {
  it('ends a definite E1 failure, retains the untaken input and releases the original slot', async () => {
    let first = true
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution(), execution('exec-2')],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          load(input) {
            if (first) {
              first = false
              throw new Error('definite node failure')
            }
            return d.journal.load(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    const handle = ok(await invoke(assembly))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
    expect(events.some(event => event.body.kind === 'input-taken')).toBe(false)
    const read = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: handle.execution }),
    )
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(read.settlement.candidate?.failure).toMatchObject({ kind: 'node-failed', node: 'E1' })
    const inputs = ok(
      await assembly.dependencies.journal.inputs({
        ...alice,
        execution: handle.execution,
        watermark: read.inputWatermark,
      }),
    )
    expect(inputs.messages).toHaveLength(1)
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(reports).toEqual([])
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly, 'exec-2')))
  })

  it('reports once with tenant, instance, execution, node and failure, and keeps the execution in the slot', async () => {
    const reports: AgentRunFailed[] = []
    const { assembly } = await stoppingAtF3(event => reports.push(event))
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'F3')
    await eventually(async () => reports.length > 0)

    expect(reports).toEqual([
      {
        kind: 'run-failed',
        tenant: tenantA,
        instance: instance(),
        execution: handle.execution,
        node: 'F3',
        failure: JOURNAL_REFUSED,
      },
    ])
    // The execution is not ended: it still holds the slot and a new invoke answers busy.
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: handle.execution })
    const loaded = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: handle.execution }),
    )
    expect(loaded.state.kind).not.toBe('ended')
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    // Nothing reports it a second time.
    for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
    expect(reports).toHaveLength(1)
  })

  it('a quiesce answers unresolved with the failed execution and withdraws nothing', async () => {
    let reported = 0
    const { assembly, host } = await stoppingAtF3(() => (reported += 1))
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'F3')
    await eventually(async () => reported === 1)
    const answer = ok(await quiesceOf(assembly))
    expect(answer).toMatchObject({ kind: 'unresolved', remaining: [handle.execution] })
    expect(host.withdrawals).toEqual([])
    // The retry answers the same remainder: nothing hands the failed execution over.
    expect(ok(await quiesceOf(assembly))).toMatchObject({
      kind: 'unresolved',
      remaining: [handle.execution],
    })
    expect(reported).toBe(1)
  })

  it('a receiver that throws changes nothing: the execution stays in the slot as remaining', async () => {
    let calls = 0
    const { assembly } = await stoppingAtF3(() => {
      calls += 1
      throw new Error('the log is gone')
    })
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'F3')
    await eventually(async () => calls === 1)
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: handle.execution })
    expect(ok(await quiesceOf(assembly))).toMatchObject({
      kind: 'unresolved',
      remaining: [handle.execution],
    })
  })
})

describe('a failed pass that the drive recovers from is not a stop', () => {
  // SPEC 依赖不可用时的等待: an unavailable write is a wait, not a stop.
  it('an I0 commit answered unavailable waits, writes the same step again at the check time and ends; nothing is reported', async () => {
    const reports: AgentRunFailed[] = []
    let refused = 0
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            if (refused === 0 && input.operation.startsWith('I0/')) {
              refused += 1
              return Promise.resolve(fail(JOURNAL_FULL))
            }
            return d.journal.commit(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    const handle = ok(await invoke(assembly))
    await eventually(async () => assembly.controls.clock.pending().length > 0)
    const due = assembly.controls.clock.pending()[0]
    if (due === undefined) throw new Error('the check time is required')
    ok(assembly.controls.clock.advanceTo(due))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
    const read = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: handle.execution }),
    )
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(refused).toBe(1)
    expect(reports).toEqual([])
  })

  it('a lost M0 receipt is reconciled, the run ends and nothing is reported', async () => {
    const reports: AgentRunFailed[] = []
    let lost = true
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            if (lost && input.operation.startsWith('M0/')) {
              lost = false
              assembly.controls.journal.failNext('commit', {
                kind: 'commit-unknown',
                outcome: 'applied',
              })
            }
            return d.journal.commit(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    const handle = ok(await invoke(assembly))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
    expect(lost).toBe(false)
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(reports).toEqual([])
  })
})
