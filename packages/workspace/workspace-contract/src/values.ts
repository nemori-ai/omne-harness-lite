import type { DurableEvidence } from '@omne-harness/exchange-refs'
import type { WorkspaceId } from '@omne-harness/legal-identity'
import type { RelationOperation } from './policy.ts'

declare const workspaceValue: unique symbol
type Brand<K extends string> = string & { readonly [workspaceValue]: K }

export type InstanceId = Brand<'InstanceId'>
export type TypeName = Brand<'TypeName'>
/** The caller's name for one operation with an effect. */
export type OperationId = Brand<'OperationId'>
/** The version the resource was at when looked at. Given by the type, never by a caller. */
export type LoadBasis = Brand<'LoadBasis'>
export type Reason = Brand<'Reason'>

const INSTANCE = /^wsi_[0-9abcdefghjkmnpqrstvwxyz]{26}$/
const TYPE_NAME = /^[a-z][a-z0-9-]{0,31}$/
const OPERATION = /^[\x21-\x7e]{1,128}$/
const REASON = /^[a-z][a-z0-9-]{0,63}$/

const parsed =
  <T extends string>(pattern: RegExp) =>
  (text: unknown): T | null =>
    typeof text === 'string' && pattern.test(text) ? (text as T) : null

export const instanceId = parsed<InstanceId>(INSTANCE)
export const typeName = parsed<TypeName>(TYPE_NAME)
export const operationId = parsed<OperationId>(OPERATION)

export function reason(code: string): Reason {
  if (!REASON.test(code)) throw new TypeError(`not a reason code: ${code}`)
  return code as Reason
}

export function loadBasis(text: string): LoadBasis {
  if (!/^[\x21-\x7e]{1,256}$/.test(text)) throw new TypeError('not a load basis')
  return text as LoadBasis
}

/** An owner has no super-admin flag: the union excludes it. */
export type Relation =
  | Readonly<{ role: 'owner' }>
  | Readonly<{ role: 'participant'; superAdmin: boolean }>

export type Standing = 'none' | 'participant' | 'admin' | 'owner'

export function standingOf(relation: Relation | null): Standing {
  if (relation === null) return 'none'
  if (relation.role === 'owner') return 'owner'
  return relation.superAdmin ? 'admin' : 'participant'
}

/** The instance a piece of work chose and its version then. Only a verification makes one. */
export type Attachment = Readonly<{ instance: InstanceId; basis: LoadBasis }>

/** `unknown`: ask about the operation, do not repeat it. `not-permitted` never says what exists. */
export type Answer<T> =
  | Readonly<{ kind: 'done'; value: T; changed: boolean }>
  | Readonly<{ kind: 'not-permitted' }>
  | Readonly<{ kind: 'not-performed'; reason: Reason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; operation: OperationId }>
  | Readonly<{ kind: 'conflict' }>

export type Read<T> =
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type NotPermitted = Readonly<{ kind: 'not-permitted' }>

export type WorkspaceSummary = Readonly<{
  workspace: WorkspaceId
  type: TypeName
  standing: Exclude<Standing, 'none'>
}>

export type InstanceAvailability =
  | Readonly<{ kind: 'available'; directory: string; basis: LoadBasis }>
  | Readonly<{ kind: 'unavailable'; reason: Reason }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

export type InstanceView = Readonly<{
  instance: InstanceId
  address: string
  availability: InstanceAvailability
}>

export type WorkspaceView = WorkspaceSummary & Readonly<{ instances: readonly InstanceView[] }>

export type RegisteredWorkspace = Readonly<{
  workspace: WorkspaceId
  instance: InstanceId
  type: TypeName
}>

/** `attachable` is not a permit: every later use of the instance verifies again. */
export type Verification =
  | Readonly<{
      kind: 'attachable'
      directory: string
      attachment: Attachment
      evidence: DurableEvidence
    }>
  | NotPermitted
  | Readonly<{ kind: 'instance-unavailable'; reason: Reason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type Located =
  | Readonly<{ kind: 'located'; workspace: WorkspaceId; instance: InstanceId }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type OperationView =
  | Readonly<{ kind: 'recorded'; operation: OperationKind; value: Json }>
  | Readonly<{ kind: 'not-recorded' }>
  | NotPermitted
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type OperationKind = 'register' | 'associate' | 'dissociate' | RelationOperation | 'destroy'

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }
