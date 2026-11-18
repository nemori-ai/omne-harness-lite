import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import { canonicalText, effectiveArgumentsOf } from '@omne-harness/authorization'
import type { PermissionBasisRequest } from '@omne-harness/permissions'
import type { AuthorizationConsumer, OnceAuthorization } from '@omne-harness/session-contract'
import type { Adoption } from '@omne-harness/tool-contract'
import type { CurrentPermissionRead, ToolPermissionAction } from './current-tool-permission.ts'

export function agentActionConsumer(
  position: Pick<
    Extract<ToolPermissionAction['origin'], { kind: 'agent-action' }>,
    'execution' | 'action'
  >,
): AuthorizationConsumer {
  return { owner: AGENT_CONSUMER_OWNER, work: position.execution, position: position.action }
}

export const onceTarget = (definition: Adoption): string => canonicalText(definition)

const sameConsumer = (a: AuthorizationConsumer, b: AuthorizationConsumer | null): boolean =>
  b !== null && a.owner === b.owner && a.work === b.work && a.position === b.position

export function onceAuthorizationFor(
  input: ToolPermissionAction,
  { authorizations = null, consumer = null }: CurrentPermissionRead,
): OnceAuthorization | null {
  const found = authorizations?.once ?? null
  return found !== null &&
    sameConsumer(found.consumer, consumer) &&
    found.target === onceTarget(input.definition) &&
    found.argumentsDigest === effectiveArgumentsOf(input.effectiveArguments).digest
    ? found
    : null
}

// A release for the session counts for the gate it names; whether its basis is current is judged.
export function sessionGrantFor(
  request: PermissionBasisRequest,
  { authorizations = null }: CurrentPermissionRead,
): string | null {
  const found = authorizations?.session ?? null
  return found !== null &&
    found.capabilityId === request.capabilityId &&
    found.enforcementKey === request.enforcementKey
    ? found.basis
    : null
}
