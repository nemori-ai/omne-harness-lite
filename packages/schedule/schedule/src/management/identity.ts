import {
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
  type ScheduleCallContext,
} from '@omne-harness/schedule-contract'
import type { ManagementDecisionInput, ManagementRequest, RecoveryScope } from './types.ts'
import { createScheduleManagementOperationRef, managementValueEqual } from './references.ts'

export function recoveryScopeMatchesContext(
  scope: RecoveryScope,
  context: ScheduleCallContext,
): boolean {
  return managementValueEqual(scope, {
    owner: context.owner,
    principalRef: context.principalRef,
    actor: context.actor,
    originatingSessionRef: context.originatingSessionRef,
  })
}

export function createScheduleManagementIdentity(scope: RecoveryScope, request: ManagementRequest) {
  const intent = { ...request, owner: scope.owner }
  const { address } = createScheduleOperationIntent(intent)
  return {
    scope,
    address,
    fingerprint: fingerprintScheduleOperation(intent),
    operationRef: createScheduleManagementOperationRef(scope, address),
  }
}

export function decisionIdentityMatches(input: ManagementDecisionInput): boolean {
  const { operation, access, current, request } = input
  if (!managementValueEqual(operation, createScheduleManagementIdentity(operation.scope, request)))
    return false
  if (!managementValueEqual(operation.scope, access.authority.scope)) return false
  if (
    current !== null &&
    (!managementValueEqual(current.view.owner, operation.scope.owner) ||
      request.kind !== 'execute' ||
      current.view.scheduleId !== request.input.scheduleId)
  )
    return false
  const author = access.authority.authorOnCreate
  const scope = operation.scope
  if (author.kind === 'system') {
    if (scope.actor.kind !== 'system' || author.principalRef !== scope.principalRef) return false
  } else {
    if (author.kind !== scope.actor.kind || author.actorRef !== scope.actor.actorRef) return false
    if (author.kind === 'agent' && author.originatingSessionRef !== scope.originatingSessionRef)
      return false
    if (author.kind === 'human' && scope.originatingSessionRef !== null) return false
  }
  if (
    access.authority.role === 'author' &&
    current !== null &&
    !managementValueEqual(current.view.author, author)
  )
    return false
  return true
}
