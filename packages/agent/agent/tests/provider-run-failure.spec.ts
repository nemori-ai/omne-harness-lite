import { describe, expect, it } from 'vitest'
import type { AgentRunFailed } from '@omne-harness/agent'
import type { AgentRegistrationHandle, Failure } from '@omne-harness/agent-contract'
import { decodeAgentRegistrationId } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  evidence,
  execution,
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
  haltedAt,
} from './loop-support.ts'

const JOURNAL_REFUSED: Failure = { kind: 'invalid', field: 'storage', reason: 'command_limit' }

const JOURNAL_FULL: Failure = {
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic: 'storage rejected the commit: queue_full',
}

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

  // D-31: a drive that cannot go on gives the slot back. The execution stays open in the Journal
  // for a later attachment; the instance takes the next execution.
  it('reports once with tenant, instance, execution, node and failure, and frees the slot', async () => {
    const reports: AgentRunFailed[] = []
    const { assembly } = await stoppingAtF3(event => reports.push(event))
    const handle = ok(await invoke(assembly))
    await haltedAt(assembly, 'F3')
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
    expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
    const loaded = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: handle.execution }),
    )
    expect(loaded.state.kind).not.toBe('ended')
    expect(ok(await invoke(assembly, 'exec-2')).execution).not.toBe(handle.execution)
    for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
    expect(reports.filter(event => event.execution === handle.execution)).toHaveLength(1)
  })

  it('a quiesce after the stop drains: the runtime holds nothing and withdraws its registration', async () => {
    let reported = 0
    const { assembly, host } = await stoppingAtF3(() => (reported += 1))
    ok(await invoke(assembly))
    await haltedAt(assembly, 'F3')
    await eventually(async () => reported === 1)
    expect(ok(await quiesceOf(assembly))).toMatchObject({ kind: 'drained', remaining: [] })
    expect(host.withdrawals).toHaveLength(1)
    expect(reported).toBe(1)
  })

  it('a receiver that throws changes nothing: the slot is freed all the same', async () => {
    let calls = 0
    const { assembly } = await stoppingAtF3(() => {
      calls += 1
      throw new Error('the log is gone')
    })
    const handle = ok(await invoke(assembly))
    await haltedAt(assembly, 'F3')
    await eventually(async () => calls === 1)
    expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
    expect(ok(await invoke(assembly, 'exec-2')).execution).not.toBe(handle.execution)
  })
})

describe('a failed pass that the drive recovers from is not a stop', () => {
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
