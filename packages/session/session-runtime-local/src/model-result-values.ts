import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import {
  checkKey,
  checkSourceToken,
  compareInteger,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ModelResultInput, ModelResultFailure } from './model-result-types.ts'
import { InvalidStateInput, positionText } from './state-values.ts'
import { boundedText } from './coordination-values.ts'

export class CustodyRefusal extends Error {
  constructor(readonly failure: ModelResultFailure['failure']) {
    super(failure)
  }
}
export type RunPending = PendingModelResponse & {
  readonly call: { readonly callId: string; readonly runId: string }
  readonly attemptId: NonNullable<PendingModelResponse['attemptId']>
}
export interface OwnedResult extends ModelResultInput {
  readonly pending: RunPending
}
export function ownResult(
  value: ModelResultInput,
  scope: SessionScope,
  limit: number,
): OwnedResult {
  const copy = copyJsonValue(value)
  if ('failed' in copy || !copy.ok || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    throw new InvalidStateInput()
  const data = copy.ok as unknown as ModelResultInput
  if (Object.keys(data).length !== 3 || !checkKey(data.resultKey)) throw new InvalidStateInput()
  boundedText(data, limit)
  const source = checkedResultSource(data.source, scope)
  if (!isRunPending(data.pending)) throw new InvalidStateInput()
  return { resultKey: data.resultKey, source, pending: data.pending }
}
export function isRunPending(value: unknown): value is RunPending {
  if (!('ok' in judgePendingModelResponse(value))) return false
  const pending = value as PendingModelResponse
  return pending.call.runId !== undefined && pending.attemptId !== undefined
}
export function checkedResultSource(value: SourceToken, scope: SessionScope): SourceToken {
  const source = checkSourceToken(value)
  if ('failure' in source) throw new InvalidStateInput()
  if (!tenantIdEquals(source.ok.tenant, scope.tenant) || source.ok.session !== scope.session)
    throw new CustodyRefusal('invalidSource')
  return source.ok
}
export function sourceCovers(actual: SourceToken, expected: SourceToken): boolean {
  return (
    actual.journalGeneration === expected.journalGeneration &&
    actual.session === expected.session &&
    tenantIdEquals(actual.tenant, expected.tenant) &&
    compareInteger(actual.tail, expected.tail) >= 0
  )
}
export function resultPosition(value: unknown, limit: number) {
  return positionText(value, limit)
}
