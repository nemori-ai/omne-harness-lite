import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionAccess, SessionWork, SessionId } from '@omne-harness/session-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type ContextReader,
  type ReaderEligibilityHandoff,
  type ReaderOperations,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'

type Ports = Readonly<{
  work: Pick<SessionWork<unknown>, 'readWork'>
  eligibility: ReaderEligibilityHandoff<unknown>
  runtime: ReaderOperations
  recoverSession(
    input: Readonly<{ tenant: TenantId; session: SessionId; scope: ScopeRef }>,
  ): Promise<Readonly<{ kind: 'ready' | 'absent' | 'unavailable' }>>
}>

async function inquiryScope(
  ports: Ports,
  access: SessionAccess<unknown>,
): Promise<ScopeRef | null> {
  const work = await ports.work.readWork(access)
  if ('failure' in work) return null
  if (!tenantEquals(work.ok.tenant, access.tenant) || work.ok.session !== access.session)
    return null
  const current = work.ok.contextScopes?.at(-1)
  if (current === undefined || current.ended !== null) return null
  const scope = decodeScopeRef({ ref: current.scope })
  return 'failure' in scope ? null : scope.ok
}

async function inquiryValue(
  reader: ContextReader,
  access: SessionAccess<unknown>,
): Promise<SessionInquiryView | null> {
  const { key, need } = sessionInquiryBinding
  const result = await reader.read([{ key, need: need.name }])
  if (result.kind !== 'success' || result.value.length !== 1) return null
  const item = result.value[0]!
  if (item.kind !== 'value' || item.need !== need.name) return null
  const parsed = need.shape.safeParse(item.value)
  const tenant = tenantCodec.encode(access.tenant)
  if (!parsed.success || !tenant.ok) return null
  return parsed.data.basis.tenant === tenant.value && parsed.data.basis.session === access.session
    ? parsed.data
    : null
}

/** Reads the current owner's publication and releases its reader; no mode, view or eligibility cache. */
export async function readPublishedInquiry(
  ports: Ports,
  input: SessionAccess<unknown>,
): Promise<SessionInquiryView | null> {
  const access = { ...input }
  try {
    const scope = await inquiryScope(ports, access)
    if (scope === null) return null
    const recovered = await ports.recoverSession({
      tenant: access.tenant,
      session: access.session,
      scope,
    })
    if (recovered.kind !== 'ready') return null
    const issued = await ports.eligibility.current({ ...access, scope, consumer: 'coordinator' })
    if (issued.kind !== 'current') return null
    const bound = await ports.runtime.bind(issued.eligibility)
    if (bound.kind !== 'bound') return null
    try {
      if (bound.reader.consumer !== 'coordinator' || bound.reader.scope.ref !== scope.ref)
        return null
      return await inquiryValue(bound.reader, access)
    } finally {
      await bound.reader.end()
    }
  } catch {
    return null
  }
}
