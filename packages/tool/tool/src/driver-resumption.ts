import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolWaitId,
  type WaitRecord,
} from '@omne-harness/tool-contract'
import type { CallAccess, ToolRecovery, WriteContext } from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import type { DriverStop } from './driver.ts'
import { digestOf } from './evidence.ts'
import { isExcludedFailure } from './ledger-exclusion.ts'

type Step<P> = CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>
type Result = DriverStop | Readonly<{ kind: 'continue'; progressed: boolean }>
type Responding = Extract<WaitRecord, { phase: 'responding' }>

const CONTINUE: Result = { kind: 'continue', progressed: true }
const STALLED: Result = { kind: 'continue', progressed: false }
const IDLE: Result = { kind: 'idle' }

function failed(failure: ToolFailure): Result {
  return { kind: 'failed', failure }
}

function after(reply: Outcome<unknown, ToolFailure>): Result {
  if ('ok' in reply) return CONTINUE
  const { failure } = reply
  return failure.kind === 'commit-unknown' ||
    failure.kind === 'stale-revision' ||
    isExcludedFailure(failure)
    ? STALLED
    : failed(failure)
}

export function waitStepOperation(
  wait: ToolWaitId,
  step: 'accept' | 'resume' | 'close',
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(`${wait}/${step}`)
  return 'ok' in decoded
    ? decoded
    : fail({ kind: 'invalid', field: 'operation', reason: decoded.failure.reason })
}

function respondingWait(recovery: ToolRecovery): Responding | undefined {
  const { state } = recovery
  if (state.phase !== 'suspended') return undefined
  const found = recovery.waits.find(
    wait =>
      wait.phase === 'responding' && digestOf(wait.intent.resume) === digestOf(state.checkpoint),
  )
  return found?.phase === 'responding' ? found : undefined
}

export function createResumptionDriver<P, B extends ContentBlock, E>(
  { commands, decisions }: Pick<ToolDependencies<P, B, E>, 'commands' | 'decisions'>,
  executionOf: (step: Step<P>) => ToolExecutionRef,
) {
  const write = (
    step: Step<P>,
    recovery: ToolRecovery,
    operation: ToolOperationId,
  ): WriteContext & Readonly<{ principal: P }> => ({
    ...executionOf(step),
    principal: step.principal,
    operation,
    expected: recovery.state.revision,
  })

  const inspect = async (step: Step<P>, wait: ToolWaitId) => {
    try {
      return await decisions.inspect({
        principal: step.principal,
        tenant: step.tenant,
        call: step.call,
        wait,
      })
    } catch {
      return fail<ToolFailure>({
        kind: 'unavailable',
        dependency: 'tool-decisions',
        diagnostic: 'the decision owner threw; its message is not reported',
      })
    }
  }

  const decide = async (step: Step<P>, recovery: ToolRecovery): Promise<Result> => {
    const { state } = recovery
    if (state.phase !== 'suspended' || state.wait.kind !== 'ask') return IDLE
    const { wait, registration } = state.wait
    if (!recovery.waits.some(record => record.phase === 'open' && record.intent.wait === wait))
      return IDLE
    const inspected = await inspect(step, wait)
    if ('failure' in inspected) return failed(inspected.failure)
    if (inspected.ok.decision === null) return IDLE
    if (digestOf(inspected.ok.registration) !== digestOf(registration))
      return { kind: 'blocked', diagnostic: 'the decision owner reports another registration' }
    const operation = waitStepOperation(wait, 'accept')
    if ('failure' in operation) return failed(operation.failure)
    return after(
      await commands.acceptDecision({
        principal: step.principal,
        tenant: step.tenant,
        call: step.call,
        operation: operation.ok,
        wait,
        decision: inspected.ok.decision,
      }),
    )
  }

  const resume = async (step: Step<P>, recovery: ToolRecovery): Promise<Result | 'waiting'> => {
    const wait = respondingWait(recovery)
    if (wait === undefined || recovery.state.phase !== 'suspended')
      return { kind: 'blocked', diagnostic: 'the queue task of a suspended call has no decision' }
    const operation = waitStepOperation(wait.intent.wait, 'resume')
    if ('failure' in operation) return failed(operation.failure)
    const prepared = await commands.prepareResume({
      ...write(step, recovery, operation.ok),
      checkpoint: recovery.state.checkpoint,
    })
    if ('ok' in prepared) return CONTINUE
    const { failure } = prepared
    if (failure.kind === 'unavailable' && failure.dependency === 'tool-queue') return 'waiting'
    if (failure.kind === 'unsupported')
      return { kind: 'blocked', diagnostic: `the resume is not permitted: ${failure.reason}` }
    return after(prepared)
  }

  const continued = (recovery: ToolRecovery): readonly Responding[] =>
    recovery.waits.flatMap(wait =>
      wait.phase === 'responding' && wait.progress.kind === 'continued' ? [wait] : [],
    )

  const close = async (
    step: Step<P>,
    recovery: ToolRecovery,
    wait: Responding,
  ): Promise<Result> => {
    if (wait.progress.kind !== 'continued') return IDLE
    const operation = waitStepOperation(wait.intent.wait, 'close')
    if ('failure' in operation) return failed(operation.failure)
    return after(
      await commands.closeWait({
        ...write(step, recovery, operation.ok),
        wait: wait.intent.wait,
        continuation: wait.progress.receipt,
      }),
    )
  }

  return { decide, resume, continued, close }
}
