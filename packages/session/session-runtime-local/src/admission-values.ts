import { createHash } from 'node:crypto'
import {
  isOk,
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  AdmissionFailure,
  type AdmissionSource,
  type AdmissionTarget,
  type AdmissionTicket,
  type AdmissionPolicy,
} from './admission-types.ts'

export function checkedPolicy(policy: AdmissionPolicy): AdmissionPolicy {
  for (const value of [policy.maxLogins, policy.maxTickets, policy.maxRecordBytes]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value >= Number.MAX_SAFE_INTEGER)
      throw new AdmissionFailure('invalid-input')
  }
  return Object.freeze({ ...policy })
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
function key(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
export function checkedSource(value: unknown): AdmissionSource {
  if (
    !object(value) ||
    !exact(value, ['centerId', 'accountId', 'loginStateHandle']) ||
    !isGovernanceCenterId(value.centerId)
  )
    throw new AdmissionFailure('invalid-input')
  const account = parseAccountId(value.accountId)
  const login = parseLoginStateId(value.loginStateHandle)
  if (!isOk(account) || !isOk(login)) throw new AdmissionFailure('invalid-input')
  return Object.freeze({
    centerId: value.centerId,
    accountId: account.ok,
    loginStateHandle: login.ok,
  })
}
export function checkedTarget(value: unknown, source: AdmissionSource): AdmissionTarget {
  if (
    !object(value) ||
    !exact(value, ['tenant', 'session', 'purpose', 'operationKey', 'inputPosition'])
  )
    throw new AdmissionFailure('invalid-input')
  const tenant = parseTenantId(value.tenant)
  if (!isOk(tenant) || tenant.ok.account !== source.accountId || !key(value.operationKey))
    throw new AdmissionFailure('invalid-input')
  const purpose = checkedPurpose(value)
  return Object.freeze({
    tenant: Object.freeze(tenant.ok),
    session: value.session as string | null,
    purpose,
    operationKey: value.operationKey,
    inputPosition: value.inputPosition as string | null,
  })
}
function checkedPurpose(value: Record<string, unknown>): AdmissionTarget['purpose'] {
  if (value.purpose === 'createSession') {
    if (value.session !== null || value.inputPosition !== null)
      throw new AdmissionFailure('invalid-input')
    return value.purpose
  }
  if (
    value.purpose !== 'startRun' ||
    !key(value.session) ||
    typeof value.inputPosition !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.inputPosition)
  )
    throw new AdmissionFailure('invalid-input')
  return value.purpose
}
export function bounded(value: string, policy: AdmissionPolicy): string {
  if (Buffer.byteLength(value, 'utf8') > policy.maxRecordBytes)
    throw new AdmissionFailure('capacity')
  return value
}
export function sourceKey(source: AdmissionSource): string {
  return digest(JSON.stringify(source))
}
export function memberBinding(source: AdmissionSource, tenant: AdmissionTarget['tenant']): string {
  return JSON.stringify({ centerId: source.centerId, accountId: source.accountId, tenant })
}
export function memberKey(source: AdmissionSource, tenant: AdmissionTarget['tenant']): string {
  return digest(memberBinding(source, tenant))
}
export function requestKey(source: AdmissionSource, target: AdmissionTarget): string {
  return digest(JSON.stringify({ source, target }))
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
export function checkedTicket(value: unknown, policy: AdmissionPolicy): AdmissionTicket {
  if (
    !object(value) ||
    !exact(value, ['root', 'id', 'sequence', 'source', 'target']) ||
    !key(value.root) ||
    !key(value.id) ||
    typeof value.sequence !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.sequence)
  )
    throw new AdmissionFailure('invalid-input')
  const source = checkedSource(value.source)
  const target = checkedTarget(value.target, source)
  const result = Object.freeze({
    root: value.root,
    id: value.id,
    sequence: value.sequence,
    source,
    target,
  })
  bounded(JSON.stringify(result), policy)
  return result
}
