// How the driver of a checkpointed call takes the answers of the suspension commands (P06, P07).
// A commit whose answer is unknown, or a revision that went stale, moves nothing that is known:
// the step is taken again in the same run on the recalled or the re-read state, and the call
// reaches its wait. Any other failure is a verdict: the duty stops the run, and nothing asks again
// on its own.
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import { callId, principalA, tenantA, ok } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority, type StartOptions } from './start-values.ts'

type Commands = Parameters<NonNullable<StartOptions['commands']>>[0]
type Wrapped = 'planSuspension' | 'suspend' | 'attachRegistration'
type Fault = 'unknown-applied' | 'stale-revision' | 'refused'

/** Answers the first call of `command` with `fault`, and every later one as the ledger does. */
function faulty(command: Wrapped, fault: Fault) {
  const attempts = { count: 0 }
  const wrap = (base: Commands): Commands => ({
    ...base,
    [command]: async (input: never) => {
      attempts.count += 1
      const original = base[command] as (input: never) => ReturnType<Commands[Wrapped]>
      if (attempts.count > 1) return original(input)
      const operation = (input as { operation: never; expected: never }).operation
      if (fault === 'unknown-applied') {
        // The commit landed, and its answer was lost.
        await original(input)
        return fail({ kind: 'commit-unknown', operation })
      }
      if (fault === 'stale-revision')
        return fail({ kind: 'stale-revision', current: (input as { expected: never }).expected })
      return fail({ kind: 'invalid', field: 'test', reason: 'refused' })
    },
  })
  return { attempts, wrap }
}

async function suspendWith(command: Wrapped, fault: Fault) {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const injected = faulty(command, fault)
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
    commands: injected.wrap,
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
  const recovery = ok(
    await harness.commands.loadRecovery({
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
    }),
  )
  return { harness, recovery, attempts: injected.attempts, state: await harness.state('c1') }
}

describe.each(['planSuspension', 'suspend', 'attachRegistration'] as const)(
  'the driver and an answer of %s that moves nothing known',
  command => {
    it.each(['unknown-applied', 'stale-revision'] as const)(
      'goes on after %s in the same run: the call reaches its open wait',
      async fault => {
        const { recovery, state, attempts } = await suspendWith(command, fault)
        expect(state.phase).toBe('suspended')
        expect(recovery.waits).toMatchObject([{ phase: 'open' }])
        // A landed commit is recalled from the ledger; a stale revision is sent again on the new one.
        expect(attempts.count).toBe(fault === 'unknown-applied' ? 1 : 2)
      },
    )
  },
)

describe('the driver and a refusal of a suspension command', () => {
  it('stops at a refused plan: the call keeps running, and the plan is not asked for again', async () => {
    const { state, attempts, recovery } = await suspendWith('planSuspension', 'refused')
    expect(state.phase).toBe('running')
    expect(attempts.count).toBe(1)
    expect(recovery.suspensions).toEqual([])
  })

  it('stops at a refused attachment: the wait stays opening with its duty', async () => {
    const { state, attempts, recovery } = await suspendWith('attachRegistration', 'refused')
    expect(state.phase).toBe('suspended')
    expect(attempts.count).toBe(1)
    expect(recovery.waits).toMatchObject([{ phase: 'opening' }])
    expect(recovery.tasks.filter(task => task.kind === 'wait-registration')).toHaveLength(1)
  })
})
