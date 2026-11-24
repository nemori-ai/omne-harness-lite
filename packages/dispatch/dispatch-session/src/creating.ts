import type { CreateAnswer, DispatchSessions, SessionToCreate } from '@omne-harness/dispatch'
import type { DispatchId, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import {
  parseForkPoint,
  workspaceSelection,
  type InputId,
  type SessionCreation,
  type SessionFailure,
} from '@omne-harness/session-contract'
import { instructionText, reminderInput } from './inputs.ts'
import type { CreationOfDispatch, SessionCalls } from './ports.ts'
import { identitiesOf, legalTenantOf } from './sources.ts'
import { UNSETTLED, called, modesOf, sessionId, workOf } from './support.ts'

const NO_MOMENT = 'the spawn has no moment to fork its session at'

/** Where the session of a spawn starts from: the dispatching session at the moment its dispatch fixed.
 * Null: the dispatch is a spawn and holds no such moment. The other modes start from nothing. */
function forkOf(dispatch: SessionToCreate['dispatch']): Pick<SessionCreation, 'fork'> | null {
  if (dispatch.mode !== 'spawn') return {}
  const point = dispatch.context === null ? null : parseForkPoint(dispatch.context)
  return point === null ? null : { fork: { source: sessionId(dispatch.dispatcher), point } }
}

const BASIS = (dispatch: string) => ({
  owner: '@omne-harness/dispatch-session',
  record: `dispatch/${dispatch}`,
  revision: '1',
  digest: `sha256:${dispatch.replace(/^dsp_/u, '')}`,
})

const detailOf = (failure: SessionFailure): string =>
  failure.kind === 'invalid' ? `invalid: ${failure.field}: ${failure.reason}` : failure.kind

/** The session a dispatch creates: derived from the tenant and the dispatch, so doing it again names the same one. */
export function sessionOfDispatch(tenant: TenantId, dispatch: DispatchId): SessionRef {
  const legal = legalTenantOf(tenant)
  if (legal === undefined) throw new TypeError('the tenant of a dispatch is not a tenant')
  return identitiesOf(legal, 'instruction', dispatch).session as unknown as SessionRef
}

export function createCreating(
  calls: SessionCalls,
): Pick<DispatchSessions, 'sessionOf' | 'create'> {
  async function creationOf(
    tenant: LegalTenant,
    { dispatch, permission }: SessionToCreate,
    input: InputId,
    fork: Pick<SessionCreation, 'fork'>,
  ): Promise<CreationOfDispatch | undefined> {
    const parent = sessionId(dispatch.dispatcher)
    const from = await workOf(calls, tenant, dispatch.dispatcher)
    if (from.kind !== 'read') return undefined
    const workspace = from.value === null ? null : workspaceSelection(from.value)
    const initial = reminderInput('instruction', input, instructionText(dispatch))
    const basis = BASIS(dispatch.id)
    const { agent } = dispatch
    if (dispatch.mode === 'handoff') {
      const relation = { kind: 'handoff', origin: parent, basis } as const
      return {
        agent,
        workspace,
        modes: null,
        standing: { relation, attendance: 'attended', initial },
      }
    }
    const now = await modesOf(calls, tenant, dispatch.dispatcher)
    if (now.kind !== 'read') return undefined
    const relation = { kind: 'child', parent, basis } as const
    return {
      agent,
      workspace,
      modes: { ...now.value, permission: permission as typeof now.value.permission },
      standing: { relation, attendance: 'unattended', initial, ...fork },
    }
  }

  return {
    sessionOf: sessionOfDispatch,

    async create(tenant, creation): Promise<CreateAnswer> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return { kind: 'failed', detail: 'not-a-tenant' }
      const identities = identitiesOf(legal, 'instruction', creation.dispatch.id)
      const fork = forkOf(creation.dispatch)
      if (fork === null) return { kind: 'failed', detail: NO_MOMENT }
      const built = await creationOf(legal, creation, identities.input, fork)
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
