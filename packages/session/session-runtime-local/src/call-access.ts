import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { checkKey, compareInteger, type LogEntry } from '@omne-harness-lite/session-log'
import { readSessionFact } from '@omne-harness-lite/session-runtime'
import {
  modelLogJsonEqual,
  ModelLogHistory,
  captureModelLogHistory,
  type CallAccess,
  type CallAccessInput,
  type CallAccessEvidence,
  type CallAccessResult,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
export interface SessionCallAccessOptions {
  readonly journal: BorrowedRunJournal
  readonly binding: SettlementLogBinding
  readonly ingress: LocalSessionIngress
  readonly preparation: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
  readonly maxInFlight: number
}
type Prefix = ModelLogHistory
const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
/** Private original-Run reads and durable Session custody, never a new execution permission. */
export function createSessionCallAccess(requested: SessionCallAccessOptions) {
  const options = Object.freeze({
    ...requested,
    preparation: Object.freeze({ ...requested.preparation }),
  })
  validateOwner(options)
  const revoked = new AbortController()
  const pending = new Set<Promise<void>>()
  let closing: Promise<void> | undefined
  function current() {
    return (
      !revoked.signal.aborted &&
      options.binding.currentGeneration() === options.journal.generation &&
      options.journal.currentGeneration() === options.journal.generation
    )
  }
  function check<T>(
    input: CallAccessInput,
    admitted: (evidence: CallAccessEvidence) => Promise<T>,
  ): Promise<CallAccessResult<T>> {
    if (!ownedInput(input, options) || typeof admitted !== 'function')
      return Promise.resolve(malformed)
    if (!current() || pending.size >= options.maxInFlight) return Promise.resolve(unavailable)
    const stop = Promise.withResolvers<void>()
    pending.add(stop.promise)
    return enter(input, admitted).finally(() => {
      pending.delete(stop.promise)
      stop.resolve()
    })
  }
  async function enter<T>(
    input: CallAccessInput,
    admitted: (evidence: CallAccessEvidence) => Promise<T>,
  ): Promise<CallAccessResult<T>> {
    const read = await options.ingress.readModelHistory(options.journal)
    if ('failure' in read) return unavailable
    const captured = 'history' in read ? read : captureModelLogHistory(null, read)
    if ('failure' in captured) return unavailable
    const prefix = captured.history
    if (!current() || !hasPreparation(prefix, options)) return unavailable
    const version = writeJsonLossless(prefix.source)
    const evidence = Object.freeze<CallAccessEvidence>({
      action: input.action,
      ref: Object.freeze({ ...input.ref }),
      source: Object.freeze({ generation: options.binding.generation, progress: prefix.tail }),
      sourceVersion: version,
      revoked: revoked.signal,
    })
    const permission = await actionPermission(input.action, prefix, options)
    if (!current() || permission === 'unavailable') return unavailable
    if (permission === 'denied') return { denied: true, evidence }
    const allowed = await admitted(evidence)
    return current() ? { allowed, evidence } : unavailable
  }
  function close(): Promise<void> {
    revoked.abort()
    return (closing ??= Promise.all([...pending]).then(() => undefined))
  }
  const access: CallAccess = Object.freeze({ check })
  return Object.freeze({ access, close })
}
function validateOwner(options: SessionCallAccessOptions) {
  const { binding, journal, preparation } = options
  if (!Number.isSafeInteger(options.maxInFlight) || options.maxInFlight <= 0)
    throw new TypeError('explicit bounded call access required')
  if (
    binding.log !== journal.log ||
    binding.generation !== journal.generation ||
    binding.session !== journal.scope.session ||
    !tenantIdEquals(binding.tenant, journal.scope.tenant) ||
    preparation.run !== journal.run
  )
    throw new TypeError('actual original Run binding required')
}
function ownedInput(input: CallAccessInput, options: SessionCallAccessOptions): boolean {
  if (
    !input ||
    input.binding !== options.binding ||
    !input.ref ||
    Object.keys(input.ref).length !== 2
  )
    return false
  if (
    !checkKey(input.ref.callId) ||
    input.ref.callId !== options.preparation.call ||
    input.ref.session !== options.journal.scope.session
  )
    return false
  return (
    ['read', 'wait', 'ack', 'settle', 'cancel'].includes(input.action) &&
    originMatches(input, options)
  )
}
function originMatches(input: CallAccessInput, options: SessionCallAccessOptions): boolean {
  return (
    input.origin === undefined ||
    modelLogJsonEqual(input.origin, {
      ...options.journal.scope,
      run: options.preparation.run,
      attempt: options.preparation.attempt,
    })
  )
}
function hasPreparation(prefix: Prefix, options: SessionCallAccessOptions): boolean {
  return prefix
    .sessionFacts({ call: options.preparation.call, kind: 'call_prepared' })
    .entries.some(({ fact }) => {
      if (fact.kind !== 'call_prepared') return false
      const actual = fact,
        expected = options.preparation
      return (
        actual.run === expected.run &&
        compareInteger(actual.attempt, expected.attempt) === 0 &&
        actual.call === expected.call &&
        actual.stepKey === expected.stepKey &&
        actual.originalPosition === expected.originalPosition
      )
    })
}
async function actionPermission(
  action: CallAccessInput['action'],
  prefix: Prefix,
  options: SessionCallAccessOptions,
): Promise<'allowed' | 'denied' | 'unavailable'> {
  if (action === 'read' || action === 'wait') return 'allowed'
  if (action !== 'ack') return 'denied'
  const fact = custodyFact(prefix, options)
  if (!fact) return 'denied'
  const saved = await options.ingress.modelResults.read(
    options.ingress.coordinationAuthority,
    options.journal.scope,
    options.preparation.call,
    fact.fact.resultKey,
  )
  if ('failure' in saved) return 'unavailable'
  if (saved.kind === 'absent') return 'denied'
  const receipt = saved.witness.receipt
  return receipt.call === options.preparation.call &&
    compareInteger(receipt.position, fact.position) === 0 &&
    saved.witness.semanticDigest === fact.fact.semanticDigest
    ? 'allowed'
    : 'unavailable'
}
function custodyFact(prefix: Prefix, options: SessionCallAccessOptions) {
  for (const { entry, fact } of prefix.sessionFacts({
    call: options.preparation.call,
    kind: 'result_custodied',
  }).entries) {
    if (fact.kind !== 'result_custodied') continue
    const expected = options.preparation
    if (
      fact.run === expected.run &&
      compareInteger(fact.attempt, expected.attempt) === 0 &&
      fact.call === expected.call
    )
      return { fact, position: entry.position }
  }
  return undefined
}
