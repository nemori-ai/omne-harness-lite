import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
export type { Access } from '@omne-harness/legal-identity'
export type { Adoption, DurableEvidence } from '@omne-harness/exchange-refs'
declare const brand: unique symbol
export type RequestContextRef<K extends string> = string & { readonly [brand]: K }
export type CandidateRef = RequestContextRef<'CandidateRef'>
export type PositionRef = RequestContextRef<'PositionRef'>
export type PlanId = RequestContextRef<'PlanId'>
export type EpochId = RequestContextRef<'EpochId'>
export type BatchRef = RequestContextRef<'BatchRef'>
export type PassageRef = RequestContextRef<'PassageRef'>
export type RegistrationRef = RequestContextRef<'RegistrationRef'>
export type SourceGeneration = RequestContextRef<'SourceGeneration'>
export type GroupToken = RequestContextRef<'GroupToken'>
export type CommitOrder = RequestContextRef<'CommitOrder'>
export type AccountingGeneration = RequestContextRef<'AccountingGeneration'>
export type RecoveryGrantRef = RequestContextRef<'RecoveryGrantRef'>
export type PrincipalKey = RequestContextRef<'PrincipalKey'>
export type HistorySequence = RequestContextRef<'HistorySequence'>
export type ContextTarget = Readonly<{ tenant: TenantId; scope: ScopeRef }>
export type RefKind =
  | 'CandidateRef'
  | 'PositionRef'
  | 'PlanId'
  | 'EpochId'
  | 'BatchRef'
  | 'PassageRef'
  | 'RegistrationRef'
  | 'SourceGeneration'
  | 'GroupToken'
  | 'CommitOrder'
  | 'AccountingGeneration'
  | 'RecoveryGrantRef'
  | 'PrincipalKey'
  | 'HistorySequence'
export type RefRejection = Readonly<{
  field: RefKind
  reason: 'type' | 'empty' | 'length' | 'character'
}>
export const REQUEST_CONTEXT_REF_MAX_LENGTH = 256
const DECIMAL = /^(0|[1-9][0-9]*)$/u
function valid<K extends RefKind>(value: string, kind: K): value is RequestContextRef<K> {
  if (kind === 'HistorySequence' || kind === 'CommitOrder') return DECIMAL.test(value)
  return (
    value.length > 0 &&
    value.length <= REQUEST_CONTEXT_REF_MAX_LENGTH &&
    ![...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
}
function decode<K extends RefKind>(
  value: unknown,
  field: K,
): Outcome<RequestContextRef<K>, RefRejection> {
  if (typeof value !== 'string') return { failure: { field, reason: 'type' } }
  if (!value.length) return { failure: { field, reason: 'empty' } }
  if (value.length > REQUEST_CONTEXT_REF_MAX_LENGTH) return { failure: { field, reason: 'length' } }
  return valid(value, field) ? { ok: value } : { failure: { field, reason: 'character' } }
}
export const decodeCandidateRef = (v: unknown) => decode(v, 'CandidateRef')
export const decodePositionRef = (v: unknown) => decode(v, 'PositionRef')
export const decodePlanId = (v: unknown) => decode(v, 'PlanId')
export const decodeEpochId = (v: unknown) => decode(v, 'EpochId')
export const decodeBatchRef = (v: unknown) => decode(v, 'BatchRef')
export const decodePassageRef = (v: unknown) => decode(v, 'PassageRef')
export const decodeRegistrationRef = (v: unknown) => decode(v, 'RegistrationRef')
export const decodeSourceGeneration = (v: unknown) => decode(v, 'SourceGeneration')
export const decodeGroupToken = (v: unknown) => decode(v, 'GroupToken')
export const decodeCommitOrder = (v: unknown) => decode(v, 'CommitOrder')
export const decodeAccountingGeneration = (v: unknown) => decode(v, 'AccountingGeneration')
export const decodeRecoveryGrantRef = (v: unknown) => decode(v, 'RecoveryGrantRef')
export const decodePrincipalKey = (v: unknown) => decode(v, 'PrincipalKey')
export const decodeHistorySequence = (v: unknown) => decode(v, 'HistorySequence')
export function compareHistorySequence(left: HistorySequence, right: HistorySequence): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}
