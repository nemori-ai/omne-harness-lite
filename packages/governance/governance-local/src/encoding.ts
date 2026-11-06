import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type {
  GovernanceScope,
  GovernanceOperationRef,
  GovernanceDefinitionRef,
} from '@omne-harness/governance-contract'
import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'

export function canonical(value: unknown): string {
  const text = canonicalize(value)
  if (text === undefined) throw new TypeError('Expected JSON value')
  return text
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex')
export const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
export const json = (value: unknown): JsonValue => JSON.parse(canonical(value))
export const scopeKey = (scope: GovernanceScope) => digest(scope)
export const definitionKey = (ref: GovernanceDefinitionRef) =>
  digest([ref.ownerId, ref.definitionId, ref.version])
export function operationIdentity(
  transactionDomain: string,
  ref: GovernanceOperationRef,
): SqlIdentity {
  return {
    scope: { kind: 'tenant', tenant: ref.scope.tenantRef },
    transactionDomain,
    operation: 'governance.apply.' + ref.owner,
    protocolVersion: '2',
    operationKey: digest(ref),
  }
}
