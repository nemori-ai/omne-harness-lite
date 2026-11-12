// The settle step of one call: RFC-0015 §5 判断次序 steps 10 to 14. It does not touch HTTP: the
// pipeline hands it the entered call and the read body, and gives `respond` to write the answer.
import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type { Codec, OperationContract, Outcome } from '@omne-harness/public-contract'
import type { OperationHandler, PrincipalFor } from '@omne-harness/access-cordis-contract'
import type { Entered } from '../registry/registry.ts'

/** The answer of one call, its body already written by the contract's codec. */
export type SettledAnswer = { readonly outcome: Outcome; readonly body: JsonValue }

/** Given by the assembly. This member writes no initial value. */
export type SettleConfig = {
  /** How long a handler may run after the abort before the entry answers for it, in milliseconds. */
  readonly graceMs: number
}

export type Clock = {
  /** Runs `run` after `ms` milliseconds. Returns the cancel. */
  readonly schedule: (ms: number, run: () => void) => () => void
}

export type SettleInput = {
  readonly entered: Entered
  /** The caller the pipeline recognised by the operation's `identity` column. */
  readonly principal: PrincipalFor<OperationContract['identity']>
  readonly messageId: string
  /** The body the pipeline read with the operation's codec. */
  readonly body: unknown
  readonly limits: JsonLimits
  readonly config: SettleConfig
  readonly clock: Clock
  /** Writes the answer. `leave` comes after it. */
  readonly respond: (answer: SettledAnswer) => void | Promise<void>
  /**
   * Step 14: reports one successful business access to identity. Not awaited; a failure in it does
   * not change the answer. This run passes none.
   */
  readonly reportAccess?: () => void
}

const EMPTY_BODY: JsonValue = { kind: 'object', entries: [] }

function emptyAnswer(outcome: Outcome): SettledAnswer {
  return { outcome, body: EMPTY_BODY }
}

/** Step 13: a handler that failed may have had an effect, so a commit's result is unknown. */
function failureOf(contract: OperationContract): SettledAnswer {
  return emptyAnswer(contract.effect === 'commit' ? 'unknown' : 'basis-unavailable')
}

/**
 * Step 12: the answer is an outcome of the contract's result set, written by its codec. `undefined`
 * when it is not, so the caller answers by step 13.
 */
function written(
  contract: OperationContract,
  answer: unknown,
  limits: JsonLimits,
): SettledAnswer | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  const { outcome, body } = answer as { readonly outcome?: unknown; readonly body?: unknown }
  if (typeof outcome !== 'string' || !Object.hasOwn(contract.outcomes, outcome)) return undefined
  const codec = (contract.outcomes as Readonly<Record<string, true | Codec<unknown>>>)[outcome]
  if (codec === undefined) return undefined
  if (codec === true) return emptyAnswer(outcome as Outcome)
  const wire = codec.write(body, limits)
  return wire.ok ? { outcome: outcome as Outcome, body: wire.value } : undefined
}

/** Steps 11 to 13: runs the handler and turns what it gives into one answer. */
async function handled(
  input: SettleInput,
  handler: OperationHandler<any>,
  contract: OperationContract,
): Promise<SettledAnswer> {
  try {
    const answer: unknown = await handler(
      { principal: input.principal, messageId: input.messageId, signal: input.entered.signal },
      input.body,
    )
    return written(contract, answer, input.limits) ?? failureOf(contract)
  } catch {
    return failureOf(contract)
  }
}

/**
 * Step 13's grace: settles with the failure answer `graceMs` after the abort, so a handler that
 * ignores the abort cannot keep the call, or the take-down, waiting. The returned cancel stops it.
 */
function graceExpiry(
  input: SettleInput,
  contract: OperationContract,
): { readonly expired: Promise<SettledAnswer>; readonly cancel: () => void } {
  const { signal } = input.entered
  let cancelTimer: (() => void) | undefined
  let onAbort: (() => void) | undefined
  const expired = new Promise<SettledAnswer>(resolve => {
    onAbort = () => {
      cancelTimer = input.clock.schedule(input.config.graceMs, () => resolve(failureOf(contract)))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return {
    expired,
    cancel: () => {
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
      cancelTimer?.()
    },
  }
}

/**
 * Steps 10 to 13. A call aborted before its handler starts answers `basis-unavailable` and the
 * handler is not called (step 10). Otherwise the handler's answer, or the grace, decides.
 */
async function decided(
  input: SettleInput,
  handler: OperationHandler<any>,
  contract: OperationContract,
): Promise<SettledAnswer> {
  if (input.entered.signal.aborted) return emptyAnswer('basis-unavailable')
  const grace = graceExpiry(input, contract)
  try {
    return await Promise.race([handled(input, handler, contract), grace.expired])
  } finally {
    grace.cancel()
  }
}

/**
 * Settles one entered call: decides its answer by the contract, writes it with `respond`, then calls
 * `leave` exactly once, also when writing fails (step 14).
 */
export async function settleCall(input: SettleInput): Promise<SettledAnswer> {
  const { member } = input.entered
  if (member.kind !== 'operation') throw new TypeError('settleCall settles operations only')
  const answer = await decided(input, member.handler, member.contract)
  try {
    await input.respond(answer)
  } finally {
    input.entered.leave()
  }
  if (answer.outcome === 'succeeded' && member.contract.countsAsAccess === true) {
    try {
      input.reportAccess?.()
    } catch {
      // The report is not part of the answer (RFC-0015 §5 AccessIdentity.reportAccess).
    }
  }
  return answer
}

/** The clock of a running entry. Tests give their own. */
export const systemClock: Clock = {
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}
