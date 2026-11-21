import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId as LegalTenant } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/dispatch-contract'
import {
  inputSourceName,
  sourceRequestIdentities,
  type InputSourceDeclaration,
  type SessionId,
  type SessionOperationId,
  type SourceRequestIdentities,
} from '@omne-harness/session-contract'

/** The three sources by which a dispatch puts an input into a session. The names are in the log. */
export const DISPATCH_SOURCES = Object.freeze({
  instruction: inputSourceName('dispatch.instruction'),
  report: inputSourceName('dispatch.report'),
  message: inputSourceName('dispatch.message'),
})
export type DispatchSource = keyof typeof DISPATCH_SOURCES

const LABELS: Readonly<Record<DispatchSource, string>> = {
  instruction: 'Dispatched work',
  report: 'Dispatch report',
  message: 'Agent message',
}

/** The declarations to register with Session: each accepts the system component of dispatch and wakes the session. */
export function dispatchInputSources(component: string): readonly InputSourceDeclaration[] {
  return (Object.keys(DISPATCH_SOURCES) as DispatchSource[]).map(key => ({
    name: DISPATCH_SOURCES[key],
    label: LABELS[key],
    accepts: { subject: 'system', component, screened: false },
    wake: 'always',
  }))
}

/** The tenant a dispatch names, as Session knows it. Undefined: the text names no tenant. */
export function legalTenantOf(tenant: TenantId): LegalTenant | undefined {
  const parsed = tenantCodec.parse(tenant)
  return parsed.ok ? parsed.value : undefined
}

export function identitiesOf(
  tenant: LegalTenant,
  source: DispatchSource,
  request: string,
  session?: SessionId,
): SourceRequestIdentities {
  return sourceRequestIdentities({
    tenant,
    source: DISPATCH_SOURCES[source],
    request,
    ...(session === undefined ? {} : { session }),
  })
}

/** The one operation that asks the run of a dispatched session to stop. The text is in the log. */
export function cancelOperationOf(tenant: LegalTenant, session: SessionId): SessionOperationId {
  const text = tenantCodec.encode(tenant)
  const parts = ['dispatch-session/1:cancel-start', text.ok ? text.value : '', session]
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  return `sop_${digest}` as SessionOperationId
}
