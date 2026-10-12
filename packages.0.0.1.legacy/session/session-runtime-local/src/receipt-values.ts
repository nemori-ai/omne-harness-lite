import {
  copyJsonValue,
  writeJsonLossless,
  isJsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  checkOperationRef,
  type OperationRef,
  type Receipt,
} from '@omne-harness-lite/session-runtime'
import { checkKey, checkSourceToken, compareInteger } from '@omne-harness-lite/session-log'
import { InvalidStateInput, positionText } from './state-values.ts'
import type { ReceiptPolicy } from './receipt-types.ts'

export function receiptPolicy(value: ReceiptPolicy): ReceiptPolicy {
  for (const bound of [value.maxRecords, value.maxRecordBytes]) {
    if (!Number.isSafeInteger(bound) || bound < 1 || bound >= Number.MAX_SAFE_INTEGER)
      throw new InvalidStateInput()
  }
  return Object.freeze({ ...value })
}
export function receiptOperation(value: unknown): OperationRef {
  const checked = checkOperationRef(value)
  if ('failure' in checked) throw new InvalidStateInput()
  return checked.operation
}
export function receiptKey(value: OperationRef): string {
  return JSON.stringify([
    value.tenant.organization,
    value.tenant.account,
    value.principal,
    value.operation,
    value.operationKey,
    value.session,
  ])
}
export function receiptDigest(value: unknown): string {
  if (!checkKey(value)) throw new InvalidStateInput()
  return value
}
export function receiptValue(value: unknown, policy: ReceiptPolicy): Receipt {
  const data = receiptObject(value, policy)
  const operation = receiptOperation(data.operation),
    source = checkSourceToken(data.source)
  if ('failure' in source) throw new InvalidStateInput()
  positionText(data.position, policy.maxRecordBytes)
  if (
    !receiptScopeMatches(operation, source.ok) ||
    compareInteger(data.position as Receipt['position'], source.ok.tail) > 0
  )
    throw new InvalidStateInput()
  return Object.freeze({
    operation,
    position: data.position as Receipt['position'],
    source: source.ok,
  })
}
function receiptObject(value: unknown, policy: ReceiptPolicy): JsonObject {
  const copied = copyJsonValue(value)
  if ('failed' in copied || Buffer.byteLength(writeJsonLossless(copied.ok)) > policy.maxRecordBytes)
    throw new InvalidStateInput()
  const data = copied.ok
  if (typeof data !== 'object' || data === null || Array.isArray(data) || isJsonNumber(data))
    throw new InvalidStateInput()
  const keys = Object.keys(data)
  if (keys.length !== 3 || !keys.every(key => ['operation', 'position', 'source'].includes(key)))
    throw new InvalidStateInput()
  return data as JsonObject
}
function receiptScopeMatches(operation: OperationRef, source: Receipt['source']): boolean {
  return (
    tenantIdEquals(operation.tenant, source.tenant) &&
    (operation.operation === 'createSession' || operation.session === source.session)
  )
}
