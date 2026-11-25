import { randomUUID } from 'node:crypto'
import type { FacilityRequest, FacilityResult } from '@omne-harness/execution-environment-contract'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { AuthorEnvironmentInput } from './author-environment.ts'

export function namingFailure(requestId: string, failure: ToolFailure): FacilityResult<never> {
  if (failure.kind === 'commit-unknown') return { kind: 'unknown', requestId }
  return {
    kind: 'rejected',
    requestId,
    reason: failure.kind === 'denied' ? 'notAuthorized' : 'unavailable',
  }
}

export function requestOf<P>(input: AuthorEnvironmentInput<P>): FacilityRequest<P> {
  return {
    requestId: randomUUID(),
    access: { principal: input.access.principal, tenant: input.access.tenant },
    origin: input.origin,
    binding: input.lease.placement.binding,
  }
}
