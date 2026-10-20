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
  return succeed({
    principal: Reflect.get(input, 'principal') as P,
    tenant,
    call: resolved.ok.call,
    admission: resolved.ok.admission,
  })
}

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
