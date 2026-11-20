import type {
  CancelAnswer,
  DispatchSessions,
  InputFate,
  PortRead,
  Started,
} from '@omne-harness/dispatch'
import type { TenantId } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import type { InputFate as SessionInputFate } from '@omne-harness/session-contract'
import type { SessionCalls } from './ports.ts'
import { REPLY_KINDS, lastReplyOf } from './reply.ts'
import { cancelOperationOf, identitiesOf, legalTenantOf } from './sources.ts'
import { UNAVAILABLE, called, read, sessionId } from './support.ts'

function ended(fate: Extract<SessionInputFate, { kind: 'answered' }>): InputFate | null {
  if (fate.terminal === 'active') return { kind: 'running' }
  if (fate.terminal === 'completed') return null
  return fate.terminal === 'failed'
    ? { kind: 'failed', detail: 'the run failed' }
    : { kind: 'cancelled', detail: 'the run was cancelled' }
}

type Start = 'absent' | 'unknown' | Readonly<{ legal: LegalTenant; fate: SessionInputFate }>

/** The starting input of a dispatched session: where it is, whether an input is there, and the stop of its run. */
export function createFollowing(
  calls: SessionCalls,
): Pick<DispatchSessions, 'startFate' | 'has' | 'cancelStart'> {
  /** The fate of the starting input: absent for no such input or tenant, unknown when it cannot be read now. */
  const startOf = async (tenant: TenantId, dispatch: Started): Promise<Start> => {
    const legal = legalTenantOf(tenant)
    if (legal === undefined) return 'absent'
    const answer = await called(() =>
      calls.fate({
        tenant: legal,
        session: sessionId(dispatch.session),
        input: identitiesOf(legal, 'instruction', dispatch.id).input,
      }),
    )
    if (answer === 'unknown') return 'unknown'
    if ('ok' in answer) return { legal, fate: answer.ok }
    return answer.failure.kind === 'denied' ? 'absent' : 'unknown'
  }

  return {
    async startFate(tenant, dispatch): Promise<PortRead<InputFate>> {
      const start = await startOf(tenant, dispatch)
      if (start === 'absent') return read({ kind: 'absent' })
      if (start === 'unknown') return UNAVAILABLE
      const { legal, fate } = start
      switch (fate.kind) {
        case 'pending':
          return read({ kind: 'waiting' })
        case 'taken':
          return read({ kind: 'running' })
        case 'settled':
          return read({ kind: 'cancelled', detail: `settled by ${fate.by}` })
        case 'refused':
          return read({ kind: 'failed', detail: `refused: ${fate.reason}` })
        case 'answered': {
          const early = ended(fate)
          if (early !== null) return read(early)
          const reply = await lastReplyOf(
            (cursor, pageBytes) =>
              calls.history({
                tenant: legal,
                session: sessionId(dispatch.session),
                kinds: REPLY_KINDS,
                cursor,
                pageBytes,
              }),
            fate.run,
          )
          return reply.kind === 'read' ? read({ kind: 'ended', reply: reply.value }) : UNAVAILABLE
        }
      }
    },

    async has(tenant, session, input): Promise<PortRead<boolean>> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return read(false)
      const to = sessionId(session)
      const answer = await called(() =>
        calls.fate({
          tenant: legal,
          session: to,
          input: identitiesOf(legal, 'report', input, to).input,
        }),
      )
      if (answer === 'unknown') return UNAVAILABLE
      if ('ok' in answer) return read(true)
      return answer.failure.kind === 'denied' ? read(false) : UNAVAILABLE
    },

    async cancelStart(tenant, dispatch): Promise<CancelAnswer> {
      const start = await startOf(tenant, dispatch)
      if (start === 'absent') return 'stopped'
      if (start === 'unknown') return 'unknown'
      const { legal, fate } = start
      if (fate.kind === 'pending') return 'requested'
      const running =
        fate.kind === 'taken' || (fate.kind === 'answered' && fate.terminal === 'active')
      if (!running) return 'stopped'
      const to = sessionId(dispatch.session)
      const cancelled = await called(() =>
        calls.cancelRun({
          tenant: legal,
          session: to,
          operation: cancelOperationOf(legal, to),
          run: fate.run,
        }),
      )
      return cancelled !== 'unknown' && 'ok' in cancelled ? 'requested' : 'unknown'
    },
  }
}
