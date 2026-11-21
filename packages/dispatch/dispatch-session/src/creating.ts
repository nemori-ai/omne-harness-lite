import type { CreateAnswer, DispatchSessions, SessionToCreate } from '@omne-harness/dispatch'
import type { DispatchId, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import {
  workspaceSelection,
  type InputId,
  type SessionFailure,
} from '@omne-harness/session-contract'
import { instructionText, reminderInput } from './inputs.ts'
import type { CreationOfDispatch, SessionCalls } from './ports.ts'
import { identitiesOf, legalTenantOf } from './sources.ts'
import { UNAVAILABLE, UNSETTLED, called, modesOf, sessionId, workOf } from './support.ts'
import { transcriptOf } from './transcript.ts'

const GONE = 'the conversation of the dispatching session was compacted since the dispatch'

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
    copy: string | null,
  ): Promise<CreationOfDispatch | undefined> {
    const parent = sessionId(dispatch.dispatcher)
    const from = await workOf(calls, tenant, dispatch.dispatcher)
    if (from.kind !== 'read') return undefined
    const workspace = from.value === null ? null : workspaceSelection(from.value)
    const initial = reminderInput('instruction', input, instructionText(dispatch, copy))
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
      standing: { relation, attendance: 'unattended', initial },
    }
  }

  /** The copy a spawn starts from, read by the moment its dispatch fixed. Null: this mode starts from no copy. */
  async function copyOf(
    tenant: LegalTenant,
    { mode, context, dispatcher }: SessionToCreate['dispatch'],
  ): Promise<string | null | CreateAnswer> {
    if (mode !== 'spawn') return null
    if (context === null) return { kind: 'failed', detail: 'the spawn has no moment to copy' }
    const view = await calls
      .view({ tenant, session: sessionId(dispatcher), moment: context })
      .catch(() => UNAVAILABLE)
    if (view.kind !== 'read') return { kind: 'unknown' }
    if (view.value === 'gone') return { kind: 'failed', detail: GONE }
    return transcriptOf(view.value.rows.map(row => row.message))
  }

  return {
    sessionOf: sessionOfDispatch,

    async create(tenant, creation): Promise<CreateAnswer> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return { kind: 'failed', detail: 'not-a-tenant' }
      const identities = identitiesOf(legal, 'instruction', creation.dispatch.id)
      const copy = await copyOf(legal, creation.dispatch)
      if (copy !== null && typeof copy !== 'string') return copy
      const built = await creationOf(legal, creation, identities.input, copy)
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
