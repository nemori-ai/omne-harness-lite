import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { SessionAccessCheck, SessionId } from '@omne-harness/session-contract'
import type { SessionAdoptedRequests } from '@omne-harness/session-cordis-contract'
import type { AdoptedRead, ChoicesRead } from './adopted-in.ts'

type Journals = Readonly<{
  readAdopted(
    scope: Readonly<{ tenant: TenantId; session: SessionId; reference?: string | undefined }>,
  ): Promise<AdoptedRead>
  readRequestChoices(
    scope: Readonly<{ tenant: TenantId; session: SessionId; reference: string }>,
  ): Promise<ChoicesRead>
}>

type Refused = Readonly<{ kind: 'denied' }> | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** Both reads of the adopted requests of a session, admitted as `history.readAdoptedRequest`. */
export function adoptedRequestsOf<P>(
  input: Readonly<{
    stopped: () => boolean
    sessionAccessCheck: SessionAccessCheck<P>
    journals: Journals
  }>,
): SessionAdoptedRequests<P> {
  async function refusal(access: Access<P>, session: SessionId): Promise<Refused | null> {
    if (input.stopped())
      return { kind: 'unavailable', diagnostic: 'the agentJournal plugin has stopped' }
    if (!tenantCodec.encode(access.tenant).ok) return { kind: 'denied' }
    let decision
    try {
      decision = await input.sessionAccessCheck.check({
        access,
        operation: 'history.readAdoptedRequest',
        target: { kind: 'session', session },
      })
    } catch (error) {
      return { kind: 'unavailable', diagnostic: `the access check threw: ${String(error)}` }
    }
    if (decision.kind === 'denied') return { kind: 'denied' }
    return decision.kind === 'allowed' ? null : decision
  }
  return {
    async readAdoptedRequest({ access, session, reference }) {
      const refused = await refusal(access, session)
      if (refused !== null) return refused
      const read = await input.journals.readAdopted({ tenant: access.tenant, session, reference })
      if (read.kind !== 'value' || read.value === null) return read
      return { kind: 'value', value: { ...read.value } }
    },
    async readRequestChoices({ access, session, reference }) {
      const refused = await refusal(access, session)
      if (refused !== null) return refused
      return input.journals.readRequestChoices({ tenant: access.tenant, session, reference })
    },
  }
}
