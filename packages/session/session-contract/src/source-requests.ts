import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { InputId, SessionId, SessionOperationId } from './identity.ts'
import type { InputSourceName } from './input-sources.ts'
import { digestOf } from './operations.ts'

export type SourceRequest = Readonly<{
  tenant: TenantId
  source: InputSourceName
  /** The requester's own identity of this request; it keeps it durably and sends it again. */
  request: string
  /** The session an input goes to. Absent: the request creates its own session. */
  session?: SessionId
}>

export type SourceRequestIdentities = Readonly<{
  session: SessionId
  input: InputId
  create: SessionOperationId
  accept: SessionOperationId
}>

const FAMILY = 'session-source/1'

/** The same request gives the same session, input and operations, whoever computes them. */
export function sourceRequestIdentities(request: SourceRequest): SourceRequestIdentities {
  const tenant = tenantCodec.encode(request.tenant)
  if (!tenant.ok) throw new TypeError('the tenant of a source request was not minted')
  if (typeof request.request !== 'string' || request.request === '')
    throw new TypeError('a source request has no request identity')
  const from = [tenant.value, request.source, request.request]
  const session = request.session ?? (digestOf([`${FAMILY}:session`, ...from]) as SessionId)
  const at = [...from, session]
  return {
    session,
    input: digestOf([`${FAMILY}:input`, ...at]) as InputId,
    create: `sop_${digestOf([`${FAMILY}:create`, ...at])}` as SessionOperationId,
    accept: `sop_${digestOf([`${FAMILY}:accept`, ...at])}` as SessionOperationId,
  }
}
