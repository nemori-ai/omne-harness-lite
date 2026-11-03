import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import type {
  CalendarOperationAddress,
  CalendarDispositionCommand,
  CalendarReactionAcknowledgement,
} from '@omne-harness/calendar'
import type { CalendarPersistenceAuthorityRequirement } from './authority.ts'
import { DOMAIN } from './schema.ts'

export function canonical(value: JsonValue): string {
  const result = canonicalize(value)
  if (result === undefined) throw new Error('Expected JSON')
  return result
}
export function digest(value: JsonValue): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function operationRef(address: CalendarOperationAddress): string {
  return `calendar-operation:${digest(address)}`
}
export function dispositionIdentity(address: CalendarOperationAddress): SqlIdentity {
  return {
    scope: { kind: 'system' },
    transactionDomain: DOMAIN,
    protocolVersion: '2',
    operation: `calendar.${address.operation}`,
    operationKey: digest(address),
  }
}
export function acknowledgementIdentity(input: CalendarReactionAcknowledgement): SqlIdentity {
  return {
    scope: { kind: 'system' },
    transactionDomain: DOMAIN,
    protocolVersion: '2',
    operation: 'calendar.ackReaction',
    operationKey: digest({
      id: input.id,
      operationRef: input.operationRef,
      acknowledgementKey: input.acknowledgementKey,
    }),
  }
}
export function authorityBinding(
  command: CalendarDispositionCommand,
): CalendarPersistenceAuthorityRequirement {
  return {
    action: 'disposition',
    address: command.address,
    fingerprint: command.expectedFingerprint,
    expectedGeneration: command.expectedGeneration,
    authorityGuardRefs: command.authorityGuardRefs,
  }
}
export function acknowledgementBinding(
  input: CalendarReactionAcknowledgement,
): CalendarPersistenceAuthorityRequirement {
  return { action: 'ackReaction', ...input }
}
