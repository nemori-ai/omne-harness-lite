import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
// `Access` has one definition in legal-identity, the two exchange values have one in
// exchange-refs. The structure judgments stay in schema-primitives.ts.
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
/** A registration of one source set in a registry. */
export type RegistrationRef = RequestContextRef<'RegistrationRef'>
/** One generation of a registered source set; never reused. */
export type SourceGeneration = RequestContextRef<'SourceGeneration'>
/** The revision token of one input group; bound to the source generation, no ABA. */
export type GroupToken = RequestContextRef<'GroupToken'>
/** The authoritative commit order of fixed adoptions in one scope, canonical non-negative decimal text. */
export type CommitOrder = RequestContextRef<'CommitOrder'>
/** One generation of the derived account index of one target. */
export type AccountingGeneration = RequestContextRef<'AccountingGeneration'>
/** A reference to a recovery grant; the host authorization owner checks it. */
export type RecoveryGrantRef = RequestContextRef<'RecoveryGrantRef'>
/** A stable principal key from a verified identity; not a hash of a generic principal. */
export type PrincipalKey = RequestContextRef<'PrincipalKey'>
/** A model-view row number in one epoch: canonical decimal text `0|[1-9][0-9]*`. */
export type HistorySequence = RequestContextRef<'HistorySequence'>
/** The tenant and scope that one source set, account index or history evidence belongs to. */
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
/**
 * Compares two history sequences as arbitrary-precision integers. Both values are canonical
 * decimal text, so a longer text is a larger number and equal lengths compare digit by digit.
 */
export function compareHistorySequence(left: HistorySequence, right: HistorySequence): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}
