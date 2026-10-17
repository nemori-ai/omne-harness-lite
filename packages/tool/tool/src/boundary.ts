// The boundary checks of every ledger command and read: the tenant shape, the branded call and
// operation identities, and the write context. A missing or malformed tenant is `denied`, so the
// answer does not tell whether the call exists (342 identity, scope and qualification).
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolRevision,
  type ToolCallId,
  type ToolFailure,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolRevision,
} from '@omne-harness/tool-contract'
import type { ToolLedgerAction } from './ledger-guards.ts'
import type { TenantId } from './ledger-store.ts'

export type CallInput<P> = Readonly<{ principal: P; tenant: TenantId; call: ToolCallId }>
export type MutationInput<P> = CallInput<P> & Readonly<{ operation: ToolOperationId }>
export type WriteInput = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  expected: ToolRevision
  instance: ToolInstanceId
  generation: string
}>

export function denied(action: ToolLedgerAction): Outcome<never, ToolFailure> {
  return fail({ kind: 'denied', action })
}

export function invalid(field: string, reason: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'invalid', field, reason })
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function filledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** The text that keys a tenant inside the store: organization and account, never the object. */
export function tenantKey(tenant: TenantId): string {
  return `${tenant.organization.text}/${tenant.account.text}`
}

/**
 * The shape of a tenant identity: the two atomic halves with filled texts. Whether the value was
 * minted by legal-identity is proven by the access guard, which the host builds with that package.
 */
export function isTenantShape(value: unknown): value is TenantId {
  if (!isObject(value) || Reflect.get(value, 'name') !== 'TenantId') return false
  const organization: unknown = Reflect.get(value, 'organization')
  const account: unknown = Reflect.get(value, 'account')
  return (
    isObject(organization) &&
    Reflect.get(organization, 'name') === 'OrganizationId' &&
    filledText(Reflect.get(organization, 'text')) &&
    isObject(account) &&
    Reflect.get(account, 'name') === 'AccountId' &&
    filledText(Reflect.get(account, 'text'))
  )
}

function identityField<T>(
  decoded: Outcome<T, Readonly<{ reason: string }>>,
  field: string,
): Outcome<T, ToolFailure> {
  return 'ok' in decoded ? decoded : invalid(field, decoded.failure.reason)
}

/** Principal, tenant and call. The principal is opaque here and judged by the access guard. */
export function judgeCallInput<P>(
  input: unknown,
  action: ToolLedgerAction,
): Outcome<CallInput<P>, ToolFailure> {
  if (!isObject(input)) return invalid('input', 'type')
  const tenant: unknown = Reflect.get(input, 'tenant')
  if (!isTenantShape(tenant) || !('principal' in input)) return denied(action)
  const call = identityField(decodeToolCallId(Reflect.get(input, 'call')), 'call')
  if ('failure' in call) return call
  // The principal type is the caller's; the ledger passes it to the guard unchanged.
  return succeed({ principal: Reflect.get(input, 'principal') as P, tenant, call: call.ok })
}

export function judgeMutationInput<P>(
  input: unknown,
  action: ToolLedgerAction,
): Outcome<MutationInput<P>, ToolFailure> {
  const base = judgeCallInput<P>(input, action)
  if ('failure' in base) return base
  const operation = identityField(
    decodeToolOperationId(Reflect.get(input as object, 'operation')),
    'operation',
  )
  if ('failure' in operation) return operation
  return succeed({ ...base.ok, operation: operation.ok })
}

/** A write context: tenant, call, operation, the expected revision and the instance binding. */
export function judgeWriteInput(input: unknown): Outcome<WriteInput, ToolFailure> {
  if (!isObject(input)) return invalid('input', 'type')
  const tenant: unknown = Reflect.get(input, 'tenant')
  if (!isTenantShape(tenant)) return denied('write')
  const call = identityField(decodeToolCallId(Reflect.get(input, 'call')), 'call')
  if ('failure' in call) return call
  const operation = identityField(
    decodeToolOperationId(Reflect.get(input, 'operation')),
    'operation',
  )
  if ('failure' in operation) return operation
  const expected = identityField(decodeToolRevision(Reflect.get(input, 'expected')), 'expected')
  if ('failure' in expected) return expected
  const instance = identityField(decodeToolInstanceId(Reflect.get(input, 'instance')), 'instance')
  if ('failure' in instance) return instance
  const generation: unknown = Reflect.get(input, 'generation')
  if (!filledText(generation)) return invalid('generation', 'type')
  return succeed({
    tenant,
    call: call.ok,
    operation: operation.ok,
    expected: expected.ok,
    instance: instance.ok,
    generation,
  })
}
