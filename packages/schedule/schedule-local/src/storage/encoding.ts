import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import {
  ScheduleFingerprintSchema,
  ScheduleJsonValueSchema,
  type ScheduleDomainError,
  type ScheduleOwner,
} from '@omne-harness/schedule-contract'
import {
  createScheduleManagementIdentity,
  type ManagementCommit,
  type OperationIdentity,
} from '@omne-harness/schedule'
import type { JsonValue, SqlIdentity, StorageScope } from '@omne-harness/sql-contract'
import { DOMAIN } from './schema.ts'

export function json(value: unknown): JsonValue {
  return ScheduleJsonValueSchema.parse(value)
}
export function canonical(value: unknown): string {
  const encoded = canonicalize(value)
  if (encoded === undefined) throw new TypeError('Expected JSON data')
  return encoded
}
export function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}
export function digest(value: unknown) {
  return ScheduleFingerprintSchema.parse(
    createHash('sha256').update(canonical(value)).digest('hex'),
  )
}
export function sqlIdentity(
  scope: StorageScope,
  operation: Pick<OperationIdentity, 'scope' | 'address'>,
): SqlIdentity {
  return {
    scope,
    transactionDomain: DOMAIN,
    operation: `schedule.management.${operation.address.operation}`,
    protocolVersion: '2',
    operationKey: digest([
      'omne.schedule.management.sql-identity/1',
      scope,
      operation.scope,
      operation.address,
    ]),
  }
}
export function commandDigest(command: ManagementCommit) {
  return digest(['omne.schedule.management.sql-command/1', command])
}
export function ownerMatches(scope: StorageScope, owner: ScheduleOwner): boolean {
  return scope.kind === 'system'
    ? owner.kind === 'system'
    : owner.kind === 'tenant' && owner.tenantId === scope.tenant
}
export function commandMatches(scope: StorageScope, command: ManagementCommit): boolean {
  const { operation, request } = command.input
  return (
    ownerMatches(scope, operation.scope.owner) &&
    equal(operation, createScheduleManagementIdentity(operation.scope, request)) &&
    (command.kind === 'replaceDefinition') ===
      (request.kind === 'execute' && request.input.action === 'replace')
  )
}
export function domainError(
  code: ScheduleDomainError['code'],
  requestId: string,
  message: string,
): ScheduleDomainError {
  return { code, message, requestId, retryable: code === 'provider_failure', details: {} }
}
