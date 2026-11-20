import type { CreateAnswer, DispatchSessions, SessionToCreate } from '@omne-harness/dispatch'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import type { InputId, SessionFailure } from '@omne-harness/session-contract'
import { instructionText, reminderInput } from './inputs.ts'
import type { CreationOfDispatch, SessionCalls } from './ports.ts'
import { identitiesOf, legalTenantOf } from './sources.ts'
import { UNSETTLED, called, modesOf, sessionId } from './support.ts'

const BASIS = (dispatch: string) => ({
  owner: '@omne-harness/dispatch-session',
  record: `dispatch/${dispatch}`,
  revision: '1',
  digest: `sha256:${dispatch.replace(/^dsp_/u, '')}`,
})

const detailOf = (failure: SessionFailure): string =>
  failure.kind === 'invalid' ? `invalid: ${failure.field}: ${failure.reason}` : failure.kind

export function createCreating(
  calls: SessionCalls,
): Pick<DispatchSessions, 'sessionOf' | 'create'> {
  async function creationOf(
    tenant: LegalTenant,
    { dispatch, permission }: SessionToCreate,
    input: InputId,
  ): Promise<CreationOfDispatch | undefined> {
    const parent = sessionId(dispatch.dispatcher)
    const initial = reminderInput('instruction', input, instructionText(dispatch))
    const basis = BASIS(dispatch.id)
    if (dispatch.mode === 'handoff')
      return {
        agent: dispatch.agent,
        modes: null,
        standing: {
          relation: { kind: 'handoff', origin: parent, basis },
          attendance: 'attended',
          initial,
        },
      }
    const now = await modesOf(calls, tenant, dispatch.dispatcher)
    if (now.kind !== 'read') return undefined
    return {
      agent: dispatch.agent,
      modes: { ...now.value, permission: permission as typeof now.value.permission },
      standing: { relation: { kind: 'child', parent, basis }, attendance: 'unattended', initial },
    }
  }

  return {
    sessionOf(tenant, dispatch) {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) throw new TypeError('the tenant of a dispatch is not a tenant')
      return identitiesOf(legal, 'instruction', dispatch).session as unknown as SessionRef
    },

    async create(tenant, creation): Promise<CreateAnswer> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return { kind: 'failed', detail: 'not-a-tenant' }
      const identities = identitiesOf(legal, 'instruction', creation.dispatch.id)
      const built = await creationOf(legal, creation, identities.input)
      if (built === undefined) return { kind: 'unknown' }
      const answer = await called(() =>
        calls.create({
          tenant: legal,
          session: sessionId(creation.session),
          operation: identities.create,
          creation: built,
        }),
      )
      if (answer === 'unknown') return { kind: 'unknown' }
      if ('ok' in answer) return { kind: 'created' }
      return UNSETTLED.has(answer.failure.kind)
        ? { kind: 'unknown' }
        : { kind: 'failed', detail: detailOf(answer.failure) }
    },
  }
}
