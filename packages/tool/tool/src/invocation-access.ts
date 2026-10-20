// The reference routing of the ordinary runtime operations: the reference is decoded and checked
// against the presented tenant once, then the operation enters the original port with the call,
// the admission or the operation the reference carries. The check never touches the store, the
// catalog or the directory; the port keeps answering the qualification of the principal.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  resolveToolInvocationRef,
  resolveToolOperationRef,
  type Access,
  type ToolCallId,
  type ToolDefiniteFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import type { TenantId } from './ledger-store.ts'
import type { ToolLedgerAction } from './ledger-guards.ts'

/** The actions a reference-bearing operation names at the boundary, including the directory. */
export type ReferenceAction = ToolLedgerAction | 'connect'

export type ResolvedAccess<P> = Access<P> &
  Readonly<{ call: ToolCallId; admission: ToolOperationId }>
export type ResolvedOperationAccess<P> = ResolvedAccess<P> &
  Readonly<{ operation: ToolOperationId }>

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function denied(action: ReferenceAction): Outcome<never, ToolDefiniteFailure> {
  return fail({ kind: 'denied', action })
}

/**
 * The boundary of a reference operation: the principal must be present, the reference must
 * decode, and the reference must name the presented tenant. A missing principal or a reference
 * of another tenant is `denied`, as a malformed tenant is; a malformed reference is `invalid`.
 * Nothing here proves that the call exists: the ports answer that.
 */
export function invocationInput<P>(
  input: unknown,
  action: ReferenceAction,
): Outcome<ResolvedAccess<P>, ToolDefiniteFailure> {
  if (!isObject(input) || !('principal' in input)) return denied(action)
  const tenant = Reflect.get(input, 'tenant') as TenantId
  const resolved = resolveToolInvocationRef(Reflect.get(input, 'reference'), tenant)
  if ('failure' in resolved) {
    return resolved.failure.kind === 'malformed'
      ? fail({
          kind: 'invalid',
          field: 'reference',
          reason: resolved.failure.rejection.reason,
        })
      : denied(action)
  }
  // The principal type is the caller's; the ports and the guards judge it unchanged.
  return succeed({
    principal: Reflect.get(input, 'principal') as P,
    tenant,
    call: resolved.ok.call,
    admission: resolved.ok.admission,
  })
}

/** Resolves the operation reference of an ordinary operation query. */
export function operationInput<P>(
  input: unknown,
  action: ReferenceAction,
): Outcome<ResolvedOperationAccess<P>, ToolDefiniteFailure> {
  if (!isObject(input) || !('principal' in input)) return denied(action)
  const tenant = Reflect.get(input, 'tenant') as TenantId
  const resolved = resolveToolOperationRef(Reflect.get(input, 'operation'), tenant)
  if ('failure' in resolved) {
    return resolved.failure.kind === 'malformed'
      ? fail({ kind: 'invalid', field: 'operation', reason: resolved.failure.rejection.reason })
      : denied(action)
  }
  return succeed({
    principal: Reflect.get(input, 'principal') as P,
    tenant,
    call: resolved.ok.call,
    admission: resolved.ok.admission,
    operation: resolved.ok.operation,
  })
}
