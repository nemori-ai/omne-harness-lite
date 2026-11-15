import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type { Codec, OperationContract, Outcome } from '@omne-harness/public-contract'
import type { OperationHandler, PrincipalFor } from '@omne-harness/access-cordis-contract'
import type { Entered } from '../registry/registry.ts'

export type SettledAnswer = { readonly outcome: Outcome; readonly body: JsonValue }

export type SettleConfig = {
  readonly graceMs: number
}

export type Clock = {
  readonly schedule: (ms: number, run: () => void) => () => void
}

export type SettleInput = {
  readonly entered: Entered
  readonly principal: PrincipalFor<OperationContract['identity']>
  readonly messageId: string
  readonly body: unknown
  readonly limits: JsonLimits
  readonly config: SettleConfig
  readonly clock: Clock
  readonly respond: (answer: SettledAnswer) => void | Promise<void>
  readonly reportAccess?: () => void
}

const EMPTY_BODY: JsonValue = { kind: 'object', entries: [] }

function emptyAnswer(outcome: Outcome): SettledAnswer {
  return { outcome, body: EMPTY_BODY }
}

function failureOf(contract: OperationContract): SettledAnswer {
  return emptyAnswer(contract.effect === 'commit' ? 'unknown' : 'basis-unavailable')
}

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
    } catch {}
  }
  return answer
}

export const systemClock: Clock = {
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}
