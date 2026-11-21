import { randomUUID } from 'node:crypto'
import {
  decodeDispatchId,
  type ModelFault,
  type Reply,
  type RetryPosition,
  type Termination,
} from '@omne-harness/model-contract'
import type {
  ExecutionRef,
  ModelClock,
  ModelCommands,
  ModelDriveInput,
  ModelInstanceHost,
  ModelRetryPolicy,
  RecoveryRecord,
} from '@omne-harness/model-contract/provider'
import { afterDispatch, type AfterDispatch } from './after-dispatch.ts'
import { verdictOf } from './commands/execution-write.ts'
import { newOperation } from './receive.ts'

type Prepare<P> = Parameters<ModelCommands<P>['prepareDispatch']>[0]
export type RetryStep<P> =
  | Readonly<{ kind: 'settle'; termination: Termination }>
  | Readonly<{ kind: 'again'; prepare: Prepare<P> }>
  | Readonly<{ kind: 'waiting' }>
export type RetryStageInput<P> = Readonly<{
  claim: ModelDriveInput<P>
  execution: ExecutionRef
  termination: Termination
}>
type Deps<P> = Readonly<{
  commands: ModelCommands<P>
  retry: ModelRetryPolicy<P>
  clock: ModelClock
  instances: Pick<ModelInstanceHost<P>, 'schedule'>
}>
type Step<K extends AfterDispatch['kind']> = Extract<AfterDispatch, { kind: K }>
// null: the retry record moved on, read it again.
type Advance<P> = Reply<RetryStep<P> | null>

const policyUnavailable = (diagnostic: string): RetryStep<never> => ({
  kind: 'settle',
  termination: {
    kind: 'failed',
    fault: { cause: 'policy-unavailable', diagnostic, upstreamStatus: null },
  },
})
const PENDING = {
  failure: {
    kind: 'unavailable',
    dependency: 'model-retry-policy',
    diagnostic: 'retry-decision-pending',
  },
} as const

function newDispatch() {
  const made = decodeDispatchId(`mdisp_${randomUUID()}`)
  if ('ok' in made) return made.ok
  throw new Error('invalid generated Model dispatch')
}

async function takePosition<P>(
  deps: Deps<P>,
  input: RetryStageInput<P>,
  recovery: RecoveryRecord,
  step: Step<'position'>,
): Advance<P> {
  const positioned = await deps.commands.prepareRetry({
    ...input.execution,
    operation: newOperation(),
    expected: recovery.state.revision,
    dispatch: step.dispatch,
  })
  if ('ok' in positioned) return { ok: null }
  return verdictOf(positioned.failure) === 'refused'
    ? { ok: { kind: 'settle', termination: input.termination } }
    : positioned
}

async function decide<P>(
  deps: Deps<P>,
  claim: ModelDriveInput<P>,
  recovery: RecoveryRecord,
  position: RetryPosition,
  failure: ModelFault,
) {
  const request = await deps.commands.loadRequest(claim)
  if ('failure' in request) return request
  const dispatches = await deps.commands.dispatches(claim)
  if ('failure' in dispatches) return dispatches
  const { principal, tenant, call } = claim
  const { initiator } = recovery
  const asked = { principal, tenant, call, position, initiator, failure }
  return Promise.resolve()
    .then(() => deps.retry.decide({ ...asked, request: request.ok, dispatches: dispatches.ok }))
    .then(
      resolution => ({ ok: resolution }),
      () => ({ ok: null }),
    )
}

async function askPolicy<P>(
  deps: Deps<P>,
  input: RetryStageInput<P>,
  recovery: RecoveryRecord,
  step: Step<'ask-policy'>,
): Advance<P> {
  const asked = await decide(deps, input.claim, recovery, step.position, step.failure)
  if ('failure' in asked) return asked
  if (asked.ok === null) return { ok: policyUnavailable('policy-threw') }
  if ('failure' in asked.ok) return { ok: policyUnavailable(asked.ok.failure.kind) }
  if (asked.ok.ok.kind === 'pending') return PENDING
  const { decision, source } = asked.ok.ok
  const written = await deps.commands.decideRetry({
    ...input.execution,
    operation: newOperation(),
    expected: recovery.state.revision,
    position: step.position,
    decision,
    source,
  })
  if ('ok' in written) return { ok: null }
  return verdictOf(written.failure) === 'refused'
    ? { ok: policyUnavailable('decision-refused') }
    : written
}

async function waitFor<P>(
  deps: Deps<P>,
  { claim }: RetryStageInput<P>,
  step: Step<'wait'>,
): Advance<P> {
  const scheduled = await deps.instances.schedule({
    tenant: claim.tenant,
    call: claim.call,
    notBefore: step.until,
  })
  return 'failure' in scheduled ? scheduled : { ok: { kind: 'waiting' } }
}

function sendAgain<P>(
  input: RetryStageInput<P>,
  recovery: RecoveryRecord,
  step: Step<'redispatch'>,
): RetryStep<P> {
  return {
    kind: 'again',
    prepare: {
      ...input.execution,
      expected: recovery.state.revision,
      operation: newOperation(),
      dispatch: newDispatch(),
      supplier: structuredClone(step.supplier),
      policyDecision: structuredClone(step.decision),
    },
  }
}

// One dispatch ended. The retry record of the call says what comes next; see after-dispatch.ts.
export function createRetryStage<P>(deps: Deps<P>) {
  async function advance(
    input: RetryStageInput<P>,
    recovery: RecoveryRecord,
    step: AfterDispatch,
  ): Advance<P> {
    switch (step.kind) {
      case 'settle':
        return { ok: step }
      case 'wait':
        return waitFor(deps, input, step)
      case 'position':
        return takePosition(deps, input, recovery, step)
      case 'ask-policy':
        return askPolicy(deps, input, recovery, step)
      case 'redispatch':
        return { ok: sendAgain(input, recovery, step) }
    }
  }
  return async function retryStep(input: RetryStageInput<P>): Reply<RetryStep<P>> {
    for (;;) {
      const recovery = await deps.commands.loadRecovery(input.claim)
      if ('failure' in recovery) return recovery
      const step = afterDispatch({
        recovery: recovery.ok,
        termination: input.termination,
        now: () => deps.clock.now(),
      })
      const advanced = await advance(input, recovery.ok, step)
      if ('failure' in advanced) return advanced
      if (advanced.ok !== null) return { ok: advanced.ok }
    }
  }
}
