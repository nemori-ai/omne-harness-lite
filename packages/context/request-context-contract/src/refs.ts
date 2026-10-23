import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type DurableEvidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>
declare const brand: unique symbol
export type RequestContextRef<K extends string> = string & { readonly [brand]: K }
export type CandidateRef = RequestContextRef<'CandidateRef'>
export type PositionRef = RequestContextRef<'PositionRef'>
export type PlanId = RequestContextRef<'PlanId'>
export type EpochId = RequestContextRef<'EpochId'>
export type BatchRef = RequestContextRef<'BatchRef'>
export type PassageRef = RequestContextRef<'PassageRef'>
export type RefKind =
  | 'CandidateRef'
  | 'PositionRef'
  | 'PlanId'
  | 'EpochId'
  | 'BatchRef'
  | 'PassageRef'
export type RefRejection = Readonly<{
  field: RefKind
  reason: 'type' | 'empty' | 'length' | 'character'
}>
export const REQUEST_CONTEXT_REF_MAX_LENGTH = 256
function valid<K extends RefKind>(value: string, _kind: K): value is RequestContextRef<K> {
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
