import type { LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StepCommit } from '@omne-harness-lite/session-runtime'
import { checkKey } from '@omne-harness-lite/session-log'

/** Root-owned original identities. They must stay fixed when a commit is unconfirmed. */
export interface SessionRunIdentities {
  readonly startKey: string
  readonly attemptKey: string
  readonly prepareKey: string
  readonly call: string
  readonly originalPosition: string
}
type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
type PreparedRun = {
  readonly kind: 'prepared'
  readonly preparation: Preparation
  readonly source: Extract<StepCommit, { kind: 'committed' }>['source']
}
type Refusal = Exclude<StepCommit, { kind: 'committed' }>
type Options = {
  readonly ingress: LocalSessionIngress
  readonly scope: SessionScope
  readonly identities: SessionRunIdentities
}

/** The host consumes the oldest persisted input. Public reads and terminal signals do not start this work. */
export async function prepareSessionModelRun(
  options: Options,
): Promise<PreparedRun | Refusal | { readonly kind: 'idle' }> {
  const { ingress, scope } = options
  const identities = originalIdentities(options.identities)
  const work = await ingress.readWork(ingress.coordinationAuthority, scope, 1)
  if ('failure' in work)
    return { failure: work.failure === 'notFound' ? 'unavailable' : work.failure }
  const stopped = cannotBegin(work)
  if (stopped) return stopped
  const run = await ingress.lifecycle.commitStep(
    ingress.coordinationAuthority,
    scope,
    work.source,
    {
      kind: 'startRun',
      stepKey: identities.startKey,
      inputPosition: work.inputs[0]!,
    },
  )
  if (!('kind' in run) || run.kind !== 'committed') return run
  return prepareOriginalAttempt({ ...options, identities }, run)
}
function originalIdentities(input: SessionRunIdentities) {
  const copy = Object.freeze({ ...input })
  const fields = ['startKey', 'attemptKey', 'prepareKey', 'call', 'originalPosition'] as const
  if (Object.keys(copy).length !== fields.length || !fields.every(field => checkKey(copy[field])))
    throw new TypeError('original Run identities required')
  return copy
}
function cannotBegin(
  work: Extract<Awaited<ReturnType<LocalSessionIngress['readWork']>>, { kind: 'work' }>,
): Refusal | { readonly kind: 'idle' } | undefined {
  if (work.head.lifecycle !== 'active') return { failure: 'terminal' }
  if (work.head.run && ['runnable', 'waiting'].includes(work.head.run.state))
    return { failure: 'retryFromFacts' }
  if (work.inputs.length === 0) return { kind: 'idle' }
  return undefined
}
async function prepareOriginalAttempt(
  options: Options,
  run: Extract<StepCommit, { kind: 'committed' }>,
): Promise<PreparedRun | Refusal> {
  const { ingress, scope, identities } = options
  if (!run.receipt.run) throw new TypeError('committed Run lacks original identity')
  const attempt = await ingress.lifecycle.commitStep(
    ingress.coordinationAuthority,
    scope,
    run.source,
    {
      kind: 'startAttempt',
      stepKey: identities.attemptKey,
      run: run.receipt.run,
      reason: 'first',
    },
  )
  if (!('kind' in attempt) || attempt.kind !== 'committed') return attempt
  if (!attempt.permit || attempt.receipt.attempt === null) return { failure: 'retryFromFacts' }
  const preparation: Preparation = {
    kind: 'prepareCall',
    stepKey: identities.prepareKey,
    run: run.receipt.run,
    attempt: attempt.receipt.attempt,
    permit: attempt.permit,
    call: identities.call,
    originalPosition: identities.originalPosition,
  }
  const prepared = await ingress.lifecycle.commitStep(
    ingress.coordinationAuthority,
    scope,
    attempt.source,
    preparation,
  )
  if (!('kind' in prepared) || prepared.kind !== 'committed') return prepared
  return Object.freeze({
    kind: 'prepared',
    preparation: Object.freeze(preparation),
    source: prepared.source,
  })
}
