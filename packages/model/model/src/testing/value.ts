import { createHash, randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelOperationId,
  decodeOutputCursor,
  decodeReadId,
  decodeResultVersion,
  decodeRevision,
  type ActorRef,
  type DurableEvidence,
  type ModelFailure,
  type Revision,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

export function take<T, F>(result: Outcome<T, F>): T {
  if ('ok' in result) return result.ok
  throw new TypeError('invalid internally generated Model identity')
}
export function tenantKey(tenant: TenantId): string | ModelFailure {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : { kind: 'denied', action: 'tenant' }
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || !('value' in descriptor))
          throw new TypeError('Model values must be data')
        return `${JSON.stringify(key)}:${canonical(descriptor.value)}`
      })
      .join(',')}}`
  }
  throw new TypeError('Model values must be finite data')
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function revision(text = '0') {
  if (BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('memory Model revision limit')
  return take(decodeRevision(text))
}
export function nextRevision(current: Revision) {
  return revision(String(BigInt(current) + 1n))
}
export function cursor(text = '0') {
  if (BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('memory Model cursor limit')
  return take(decodeOutputCursor(text))
}
export function operation() {
  return take(decodeModelOperationId(`mop_${randomUUID()}`))
}
export function readId() {
  return take(decodeReadId(`mread_${randomUUID()}`))
}
export function resultVersion() {
  return take(decodeResultVersion(`mrver_${randomUUID()}`))
}
export function invalid(field: string, reason: string): ModelFailure {
  return { kind: 'invalid', field, reason }
}
export function unavailable(dependency: string, diagnostic: string): ModelFailure {
  return { kind: 'unavailable', dependency, diagnostic }
}
export function decimal(value: string, positive = false): boolean {
  return /^(0|[1-9][0-9]*)$/u.test(value) && (!positive || value !== '0')
}
export function positiveLimit(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${field} must be a positive safe integer`)
}

export function checkedOutcome<T>(result: Outcome<T, ModelFailure>): Outcome<T, ModelFailure> {
  if (typeof result !== 'object' || result === null || 'ok' in result === 'failure' in result)
    throw new TypeError('memory Model adapters must return a synchronous Outcome')
  return result
}

export function checkedActor(
  result: Outcome<ActorRef, ModelFailure>,
): Outcome<ActorRef, ModelFailure> {
  const outcome = checkedOutcome(result)
  if (
    'ok' in outcome &&
    (!outcome.ok ||
      typeof outcome.ok !== 'object' ||
      ![outcome.ok.owner, outcome.ok.subject, outcome.ok.revision].every(
        value => typeof value === 'string' && value.length > 0,
      ))
  )
    throw new TypeError('memory Model authority must return an ActorRef')
  if ('ok' in outcome && Buffer.byteLength(canonical(outcome.ok), 'utf8') > 4096)
    return { failure: invalid('actor', 'encoded-byte-limit') }
  return outcome
}
const MAX_EVIDENCE_BYTES = 4096
export function checkedEvidence(
  result: Outcome<DurableEvidence, ModelFailure>,
): Outcome<DurableEvidence, ModelFailure> {
  const outcome = checkedOutcome(result)
  if (
    'ok' in outcome &&
    (!outcome.ok ||
      typeof outcome.ok !== 'object' ||
      ![outcome.ok.owner, outcome.ok.record, outcome.ok.revision, outcome.ok.digest].every(
        value => typeof value === 'string' && value.length > 0,
      ))
  )
    throw new TypeError('memory Model evidence must return a bound evidence record')
  if ('ok' in outcome && Buffer.byteLength(canonical(outcome.ok), 'utf8') > MAX_EVIDENCE_BYTES)
    return { failure: invalid('evidence', 'encoded-byte-limit') }
  return outcome
}
