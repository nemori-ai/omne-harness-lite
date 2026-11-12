// The driver steps of a checkpointed call after a person answered its wait (P06, P07): learn the
// decision from the decision owner and accept it, take the slot again and save the resume, and
// close the wait at the resume segment's `continued` fact. Each step is one ledger command, or one
// port read, with an identity the wait fixes: a repeat after a crash or an unknown answer recalls
// the original, so one wait is answered once and its checkpoint resumed once.
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

/** The answer of a command: progress, a step to read again, or a verdict that stops the run. */
function after(reply: Outcome<unknown, ToolFailure>): Result {
  if ('ok' in reply) return CONTINUE
  const { failure } = reply
  return failure.kind === 'commit-unknown' ||
    failure.kind === 'stale-revision' ||
    isExcludedFailure(failure)
    ? STALLED
    : failed(failure)
}

/**
 * The operation of a step on a wait: `<wait>/accept`, `<wait>/resume` or `<wait>/close`. A call
 * never uses a wait identity twice, so the wait and the step fix the operation.
 */
export function waitStepOperation(
  wait: ToolWaitId,
  step: 'accept' | 'resume' | 'close',
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(`${wait}/${step}`)
  return 'ok' in decoded
    ? decoded
    : fail({ kind: 'invalid', field: 'operation', reason: decoded.failure.reason })
}

/** The responding wait whose decision resumes at the call's checkpoint, or undefined. */
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

  /** What the decision owner reports for the wait: its decision evidence, or null while none. */
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

  /**
   * The step of a suspended call on its open Ask wait (P06): ask the decision owner whether the
   * person decided; with a decision, accept it under `<wait>/accept`. No decision yet leaves the
   * call idle until a wake-up. The registration that the owner reports must be the one the wait
   * holds; another one is not this wait's decision.
   */
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

  /**
   * The step of a suspended call whose decision was accepted (P02, P07): prepare the resume under
   * `<wait>/resume`, which requeues the parked entry, takes a slot and saves the resume record.
   * `waiting` tells the caller that the call waits for its place; a refused start qualification
   * stops the run with the reason.
   */
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

  /** The waits whose resume segment continued them and that `closeWait` still owes. */
  const continued = (recovery: ToolRecovery): readonly Responding[] =>
    recovery.waits.flatMap(wait =>
      wait.phase === 'responding' && wait.progress.kind === 'continued' ? [wait] : [],
    )

  /** Closes a continued wait under `<wait>/close`, with the evidence of its `continued` fact. */
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
