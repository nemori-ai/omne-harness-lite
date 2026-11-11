import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { matchesCapturedInquiry } from './permission-inquiry.ts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import {
  decodeSessionPermissionCurrent,
  SESSION_PERMISSION_CURRENT_HANDLER,
  type SessionPermissionCurrent,
  type SessionPermissionReadResult,
} from '@omne-harness/session-storage-sql/participants'
import {
  PermissionSourceSchema,
  type PermissionBasisRequest,
  type PermissionDefinition,
  type PermissionSource,
} from '@omne-harness/permissions'

export const sessionPermissionObservationSchema = z.json().transform((value, ctx) => {
  const parsed = decodeSessionPermissionCurrent(value)
  if (parsed !== 'malformed' && parsed.kind === 'current') return parsed
  ctx.addIssue({ code: 'custom', message: 'A current Session permission observation is required' })
  return z.NEVER
})

export type SessionPermissionCaptureReader = (
  request: PermissionBasisRequest,
) => Promise<SessionPermissionReadResult | undefined>

/** Used by trusted per-tenant assembly after original principal and action qualification. */
export async function readSessionPermissionForCapture(
  storage: SqlStorage,
  domain: DomainRef,
  request: PermissionBasisRequest,
): Promise<SessionPermissionReadResult | undefined> {
  const { scope, capabilityId, enforcementKey } = request
  if (
    scope.sessionId === null ||
    domain.scope.kind !== 'tenant' ||
    domain.scope.tenant !== scope.tenantId
  )
    return undefined
  const read = await storage.read({
    domain,
    handler: SESSION_PERMISSION_CURRENT_HANDLER,
    protocol: '1',
    requestKey: randomUUID(),
    input: { tenant: scope.tenantId, session: scope.sessionId, capabilityId, enforcementKey },
  })
  if (read.kind !== 'read') return undefined
  const parsed = decodeSessionPermissionCurrent(read.output)
  return parsed === 'malformed' ? undefined : parsed
}

export function matchesSessionPermission(
  current: SessionPermissionCurrent,
  request: PermissionBasisRequest,
): boolean {
  return (
    current.tenant === request.scope.tenantId &&
    current.session === request.scope.sessionId &&
    current.capabilityId === request.capabilityId &&
    current.enforcementKey === request.enforcementKey
  )
}

export async function readBoundSessionPermission(
  reader: SessionPermissionCaptureReader,
  request: PermissionBasisRequest,
  inquiry: SessionInquiryView | null,
): Promise<SessionPermissionCurrent | undefined> {
  const parsed = sessionPermissionObservationSchema.safeParse(await reader(request))
  if (!parsed.success || !matchesSessionPermission(parsed.data, request)) return undefined
  return matchesCapturedInquiry(inquiry, parsed.data) ? parsed.data : undefined
}

/** A stale definition is an unknown layer; it must not erase a prohibition from another layer. */
export function sessionPermissionSource(
  current: SessionPermissionCurrent,
  request: PermissionBasisRequest,
  definition: PermissionDefinition,
): PermissionSource | undefined {
  if (!matchesSessionPermission(current, request)) return undefined
  const { assignment } = current
  const revision = canonicalDigest({ revision: current.revision, source: current.source })
  if (assignment === null) return { kind: 'absent', revision }
  const sourceRef = canonicalDigest({
    owner: 'session.permission-current',
    tenant: current.tenant,
    session: current.session,
    capabilityId: current.capabilityId,
    enforcementKey: current.enforcementKey,
  })
  if (
    canonicalText(assignment.definition) !== canonicalText(request.definition) ||
    !definition.assignmentLayers.includes('session')
  )
    return { kind: 'unavailable', sourceRef }
  return PermissionSourceSchema.parse({
    kind: 'available',
    sourceRef,
    revision,
    scope: request.scope,
    definition: request.definition,
    rule: assignment.rule,
  })
}
