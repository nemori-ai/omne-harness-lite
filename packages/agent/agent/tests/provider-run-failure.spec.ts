// A run whose drive stops on a failure (SPEC「运行失败」, R2-D282). Before this, the drive dropped
// the answer of `runExecution`, `waitForWake` answered `stopped` and the drive ended silently: the
// slot stayed `running` and nobody was told. Now the slot becomes `failed` and the factory caller's
// receiver gets one named report. The execution is not ended and its responsibility is not handed
// over (ending the Run as failed and releasing its attachment when a node fails is not implemented
// yet, planned for wave 3, R2-D285): it keeps the slot, shows occupied, and a quiesce still
// answers it as remaining (R2-D285), never drained.
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

const JOURNAL_DOWN: Failure = {
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic: 'storage rejected the commit: command_limit',
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

/** An assembly whose Journal refuses every commit of the I0 node, with a report receiver. */
async function failingAtI0(failed: (event: AgentRunFailed) => void) {
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
            ? Promise.resolve(fail(JOURNAL_DOWN))
            : d.journal.commit(input),
      },
    }),
    undefined,
    undefined,
    { failed },
  )
  return { assembly, host }
}

const quiesceOf = (assembly: Awaited<ReturnType<typeof failingAtI0>>['assembly']) =>
  assembly.provider.control.quiesce({
    ...alice,
    operation: operation('quiesce-1'),
    reason: evidence('stop'),
  })

describe('a run that stops on a node failure', () => {
  it('reports once with tenant, instance, execution, node and failure, and keeps the execution in the slot', async () => {
    const reports: AgentRunFailed[] = []
    const { assembly } = await failingAtI0(event => reports.push(event))
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'E4')
    await eventually(async () => reports.length > 0)

    expect(reports).toEqual([
      {
        kind: 'run-failed',
        tenant: tenantA,
        instance: instance(),
        execution: handle.execution,
        node: 'I0',
        failure: JOURNAL_DOWN,
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
    const { assembly, host } = await failingAtI0(() => (reported += 1))
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'E4')
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
    const { assembly } = await failingAtI0(() => {
      calls += 1
      throw new Error('the log is gone')
    })
    const handle = ok(await invoke(assembly))
    await stoppedAt(assembly, 'E4')
    await eventually(async () => calls === 1)
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: handle.execution })
    expect(ok(await quiesceOf(assembly))).toMatchObject({
      kind: 'unresolved',
      remaining: [handle.execution],
    })
  })
})

describe('a failed pass that the drive recovers from is not a stop', () => {
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
