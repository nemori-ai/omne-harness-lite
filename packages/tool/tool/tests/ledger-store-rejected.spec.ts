// SPEC 11: a commit that the ledger store rejects can never be accepted. The ledger answers the
// definite failure `invalid` (`field: storage`, the store's reason), at once: it neither re-reads
// and decides again, as it does after a revision conflict, nor spends `ledgerCommitAttempts`.
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerCommitInput } from '@omne-harness/tool'
import {
  admission,
  adoption,
  callId,
  failure,
  fixedOf,
  fixedRequestForNamedSourceGuard,
  ok,
  request,
  tenantA,
  type Block,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  losingCommits,
  startHarness,
  toStarting,
  writeContext,
} from './start-values.ts'

// Every scenario ends with every queue entry accounted for by its call domain (SPEC 22).
afterEach(auditQueues)

const rejected = { kind: 'invalid', field: 'storage', reason: 'command_limit' } as const

/** A harness whose store rejects up to `times` commits matching `matches`, counting each one. */
function rejecting(matches: (input: LedgerCommitInput<Block>) => boolean, times: number) {
  const seen = { rejectable: 0 }
  let armed = false
  const harness = startHarness({
    ledgerCommitAttempts: times,
    store: memory =>
      losingCommits(
        memory,
        input => {
          if (!armed || !matches(input)) return false
          seen.rejectable += 1
          return true
        },
        'rejected',
        times,
      ),
  })
  return {
    harness,
    seen,
    arm: () => {
      armed = true
    },
  }
}

describe('11 a commit the ledger store rejects', () => {
  it('11 rejected: an admission answers invalid storage after one commit, and nothing is admitted', async () => {
    const { harness, seen, arm } = rejecting(input => input.domain.kind === 'call', 3)
    arm()
    const fixed = fixedRequestForNamedSourceGuard(request())
    expect(await harness.ledger.admissions.admit(admission('c1', 'op-c1', fixed))).toEqual({
      failure: rejected,
    })
    expect(seen.rejectable).toBe(1)
    expect(
      await harness.memory.read({ kind: 'call', tenant: tenantA, call: callId('c1') }),
    ).toEqual({ kind: 'complete', revision: '0', records: [] })
  })

  it('11 rejected: a queue-domain step answers invalid storage after one commit', async () => {
    const { harness, seen, arm } = rejecting(input => input.domain.kind === 'queue', 3)
    await admitCall(harness, 'c1')
    const preparation = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: fixedOf(harness.internalRequests, 'c1'),
        purpose: 'initial',
        environmentAdoption: adoption('environment'),
      }),
    )
    ok(
      await harness.commands.prepared({
        ...(await writeContext(harness, 'c1', 'c1/prepared')),
        preparation,
        resources: { owner: 'o', record: 'env', revision: '1', digest: 'd' },
      }),
    )
    arm()
    const before = await harness.state('c1')
    expect(
      failure(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue'))),
    ).toEqual(rejected)
    expect(seen.rejectable).toBe(1)
    expect(await harness.state('c1')).toEqual(before)
  })
})

/** Whether a commit writes the operation record of `operation`: the commit of that operation. */
function putsOperation(operation: string) {
  return (input: LedgerCommitInput<Block>) =>
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'operation' &&
        write.record.operation.operation === operation,
    )
}

/** Whether a commit is a queue-domain commit that deletes the entry of `call`: its release. */
function releasesEntry(call: string) {
  return (input: LedgerCommitInput<Block>) =>
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'delete' && write.key === `entry:${call}`)
}

const minimalTerminal = {
  phase: 'settled',
  terminal: {
    kind: 'failed',
    cause: 'runtime-lost',
    diagnostic: 'ledger-store rejected: command_limit',
  },
  effect: { kind: 'not-started' },
  execution: { kind: 'not-started' },
} as const

describe('23 a step of a call that never started, rejected by the store', () => {
  // c1's start intent is rejected for good after the queue gave it the only slot of the key.
  const startRejected = (memory: Parameters<typeof losingCommits>[0]) =>
    losingCommits(memory, putsOperation('op-c1/start'), 'rejected', 100)

  it('23 rejected: the call settles with the minimal failure terminal, is delivered, and frees its slot', async () => {
    const harness = startHarness({ store: startRejected })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(await harness.state('c1')).toMatchObject(minimalTerminal)
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.start).toBeNull()
    expect(recovery.tasks).toEqual([
      expect.objectContaining({ kind: 'deliver', operation: 'op-c1/ledger-rejected' }),
    ])
    expect(await harness.released()).toContain('c1')
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'preparing' }])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('23 rejected: a release that failed after the terminal committed is finished by the next run under the same identity', async () => {
    const harness = startHarness({
      store: memory => losingCommits(startRejected(memory), releasesEntry('c1'), 'unavailable', 1),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.runOnce('c1')
    expect(await harness.state('c1')).toMatchObject(minimalTerminal)
    expect(await harness.released()).not.toContain('c1')
    await harness.runOnce('c1')
    expect(await harness.released()).toContain('c1')
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.tasks.map(task => task.kind)).toEqual(['deliver'])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('23 rejected: a call with a start record is not settled by the minimal terminal', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    await toStarting(harness, 'c1')
    const commits = harness.memory.commits
    expect(
      failure(
        await harness.ledger.rejections.settle({
          ...(await writeContext(harness, 'c1', 'op-c1/ledger-rejected')),
          reason: 'command_limit',
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'call', reason: 'has-start-record' })
    expect(harness.memory.commits).toBe(commits)
  })
})
