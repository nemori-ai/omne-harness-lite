import type { DurableEvidence } from '@omne-harness/exchange-refs'
import type { WorkspaceId } from '@omne-harness/legal-identity'

declare const workspaceValue: unique symbol
type Brand<K extends string> = string & { readonly [workspaceValue]: K }

/** One materialisation of a workspace on a node. Minted by the workspace domain, opaque outside it. */
export type InstanceId = Brand<'InstanceId'>
/** The name a management type is contributed under. */
export type TypeName = Brand<'TypeName'>
/** The caller's name for one operation with an effect. The same name asks about the same operation. */
export type OperationId = Brand<'OperationId'>
/** The version the physical resource was at when it was looked at. Given by the type, never by a caller. */
export type LoadBasis = Brand<'LoadBasis'>
/** A stable code that says why something was not done. The governance layer and each type name their own. */
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

/** A reason is written by code, not read from outside: a malformed one is a programming error. */
export function reason(code: string): Reason {
  if (!REASON.test(code)) throw new TypeError(`not a reason code: ${code}`)
  return code as Reason
}

/** A basis is written by a management type. It is one line of printable text. */
export function loadBasis(text: string): LoadBasis {
  if (!/^[\x21-\x7e]{1,256}$/.test(text)) throw new TypeError('not a load basis')
  return text as LoadBasis
}

/** What a tenant currently is to a workspace. An owner has no super-admin flag: the union excludes it. */
export type Relation =
  | Readonly<{ role: 'owner' }>
  | Readonly<{ role: 'participant'; superAdmin: boolean }>

export type Standing = 'none' | 'participant' | 'admin' | 'owner'

export function standingOf(relation: Relation | null): Standing {
  if (relation === null) return 'none'
  if (relation.role === 'owner') return 'owner'
  return relation.superAdmin ? 'admin' : 'participant'
}

/** The instance a piece of work chose and the version it was at then. Only a verification makes one. */
export type Attachment = Readonly<{ instance: InstanceId; basis: LoadBasis }>

/**
 * What an operation with an effect answered.
 * `done` with `changed: false` is the idempotent return: the facts already were as asked.
 * `not-permitted` never says whether the workspace exists.
 * `unknown`: it is not known whether the effect happened; ask about the operation, do not repeat it.
 * `conflict`: the same operation name was used before with a different input.
 */
export type Answer<T> =
  | Readonly<{ kind: 'done'; value: T; changed: boolean }>
  | Readonly<{ kind: 'not-permitted' }>
  | Readonly<{ kind: 'not-performed'; reason: Reason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; operation: OperationId }>
  | Readonly<{ kind: 'conflict' }>

/** A read returns the facts or says it could not read. It never answers empty instead. */
export type Read<T> =
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type NotPermitted = Readonly<{ kind: 'not-permitted' }>

export type WorkspaceSummary = Readonly<{
  workspace: WorkspaceId
  type: TypeName
  standing: Exclude<Standing, 'none'>
}>

/** Whether an instance can be used now is looked at each time; it is never a stored state. */
export type InstanceAvailability =
  | Readonly<{ kind: 'available'; directory: string; basis: LoadBasis }>
  | Readonly<{ kind: 'unavailable'; reason: Reason }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

export type InstanceView = Readonly<{
  instance: InstanceId
  /** The locator the instance was associated under. A locator is not the identity. */
  address: string
  availability: InstanceAvailability
}>

export type WorkspaceView = WorkspaceSummary & Readonly<{ instances: readonly InstanceView[] }>

export type RegisteredWorkspace = Readonly<{
  workspace: WorkspaceId
  instance: InstanceId
  type: TypeName
}>

/**
 * Whether this tenant may attach this instance to its work now.
 * `attachable` is not a permit: every later use of the instance verifies again.
 */
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

/** What is known about an operation asked about by name. Only done effects are kept. */
export type OperationView =
  | Readonly<{ kind: 'recorded'; operation: OperationKind; value: Json }>
  | Readonly<{ kind: 'not-recorded' }>
  | NotPermitted
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type OperationKind = 'register' | 'associate' | 'dissociate'

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }
