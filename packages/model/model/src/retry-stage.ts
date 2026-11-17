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
import { afterDispatch } from './after-dispatch.ts'
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

const policyUnavailable = (diagnostic: string): Termination => ({
  kind: 'failed',
  fault: { cause: 'policy-unavailable', diagnostic, upstreamStatus: null },
})

function newDispatch() {
  const made = decodeDispatchId(`mdisp_${randomUUID()}`)
  if ('ok' in made) return made.ok
  throw new Error('invalid generated Model dispatch')
}

// One dispatch ended. The retry record of the call says what comes next; see after-dispatch.ts.
export function createRetryStage<P>(
  deps: Readonly<{
    commands: ModelCommands<P>
    retry: ModelRetryPolicy<P>
    clock: ModelClock
    instances: Pick<ModelInstanceHost<P>, 'schedule'>
  }>,
) {
  const { commands, retry, clock, instances } = deps

  async function askPolicy(
    { claim, execution }: RetryStageInput<P>,
    recovery: RecoveryRecord,
    position: RetryPosition,
    failure: ModelFault,
  ): Reply<Termination | null> {
    const request = await commands.loadRequest(claim)
    if ('failure' in request) return request
    const records = await commands.dispatches(claim)
    if ('failure' in records) return records
    const resolution = await Promise.resolve()
      .then(() =>
        retry.decide({
          principal: claim.principal,
          tenant: claim.tenant,
          call: claim.call,
          position,
          initiator: recovery.initiator,
          request: request.ok,
          dispatches: records.ok,
          failure,
        }),
      )
      .catch(() => null)
    if (resolution === null) return { ok: policyUnavailable('policy-threw') }
    if ('failure' in resolution) return { ok: policyUnavailable(resolution.failure.kind) }
    if (resolution.ok.kind === 'pending')
      return {
        failure: {
          kind: 'unavailable',
          dependency: 'model-retry-policy',
          diagnostic: 'retry-decision-pending',
        },
      }
    const written = await commands.decideRetry({
      ...execution,
      operation: newOperation(),
      expected: recovery.state.revision,
      position,
      decision: resolution.ok.decision,
      source: resolution.ok.source,
    })
    if ('ok' in written) return { ok: null }
    return verdictOf(written.failure) === 'refused'
      ? { ok: policyUnavailable('decision-refused') }
      : written
  }

  return async function retryStep(input: RetryStageInput<P>): Reply<RetryStep<P>> {
    const { claim, execution, termination } = input
    for (;;) {
      const recovery = await commands.loadRecovery(claim)
      if ('failure' in recovery) return recovery
      const next = afterDispatch({ recovery: recovery.ok, termination, now: clock.now() })
      switch (next.kind) {
        case 'ended':
          return { ok: { kind: 'settle', termination } }
        case 'settle':
          return { ok: next }
        case 'wait': {
          const scheduled = await instances.schedule({
            tenant: claim.tenant,
            call: claim.call,
            notBefore: next.until,
          })
          return 'failure' in scheduled ? scheduled : { ok: { kind: 'waiting' } }
        }
        case 'position': {
          const positioned = await commands.prepareRetry({
            ...execution,
            operation: newOperation(),
            expected: recovery.ok.state.revision,
            dispatch: next.dispatch,
          })
          if ('ok' in positioned) break
          if (verdictOf(positioned.failure) !== 'refused') return positioned
          return { ok: { kind: 'settle', termination } }
        }
        case 'ask-policy': {
          const asked = await askPolicy(input, recovery.ok, next.position, next.failure)
          if ('failure' in asked) return asked
          if (asked.ok !== null) return { ok: { kind: 'settle', termination: asked.ok } }
          break
        }
        case 'redispatch':
          return {
            ok: {
              kind: 'again',
              prepare: {
                ...execution,
                expected: recovery.ok.state.revision,
                operation: newOperation(),
                dispatch: newDispatch(),
                supplier: structuredClone(next.supplier),
                policyDecision: structuredClone(next.decision),
              },
            },
          }
      }
    }
  }
}
