import type {
  DispatchSessions,
  InputToSend,
  PortRead,
  SendAnswer,
  SessionRow,
} from '@omne-harness/dispatch'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import type { TenantId as LegalTenant } from '@omne-harness/legal-identity'
import {
  relationToReference,
  standingOf,
  type DirectoryStanding,
  type RelationToReference,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { messageText, reminderInput, reportText } from './inputs.ts'
import type { SessionCalls } from './ports.ts'
import { identitiesOf, legalTenantOf } from './sources.ts'
import { UNAVAILABLE, called, modesOf, read, sessionId, workOf } from './support.ts'

function standing(work: WorkSnapshot): DirectoryStanding {
  const { relation, tree } = standingOf(work)
  return {
    session: work.session,
    parent: relation.kind === 'child' ? relation.parent : null,
    origin: relation.kind === 'handoff' ? relation.origin : null,
    root: tree.root,
    depth: tree.depth,
  }
}

/** The row of a session as the session itself gives it, and the inputs sent to a session. */
export function createSending(calls: SessionCalls): Pick<DispatchSessions, 'row' | 'send'> {
  async function relationOf(
    tenant: LegalTenant,
    from: SessionRef,
    to: SessionRef,
  ): Promise<RelationToReference | null> {
    const [sender, receiver] = await Promise.all([
      workOf(calls, tenant, from),
      workOf(calls, tenant, to),
    ])
    if (sender.kind !== 'read' || receiver.kind !== 'read') return null
    if (sender.value === null || receiver.value === null) return null
    return relationToReference(standing(sender.value), standing(receiver.value))
  }

  return {
    async row(tenant, session): Promise<PortRead<SessionRow | null>> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return read(null)
      const work = await workOf(calls, legal, session)
      if (work.kind !== 'read') return UNAVAILABLE
      if (work.value === null) return read(null)
      const modes = await modesOf(calls, legal, session)
      if (modes.kind !== 'read') return UNAVAILABLE
      return read({
        session,
        depth: standingOf(work.value).tree.depth,
        archived: work.value.lifecycle === 'archived',
        agent: work.value.definition.name,
        permission: modes.value.permission,
      })
    },

    async send(tenant, input: InputToSend): Promise<SendAnswer> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return { kind: 'refused', reason: 'no-such-session' }
      const source = input.source === 'dispatch.report' ? 'report' : 'message'
      const to = sessionId(input.to)
      const identities = identitiesOf(legal, source, input.input, to)
      const text =
        source === 'report'
          ? reportText(input.from, input.text)
          : messageText(
              input.from,
              await relationOf(legal, input.from.session, input.to),
              input.text,
            )
      const answer = await called(() =>
        calls.accept({
          tenant: legal,
          session: to,
          operation: identities.accept,
          value: reminderInput(source, identities.input, text),
        }),
      )
      if (answer === 'unknown') return { kind: 'unknown' }
      if ('ok' in answer) return { kind: 'sent' }
      const { kind } = answer.failure
      if (kind === 'archived' || kind === 'frozen') return { kind: 'refused', reason: 'archived' }
      return kind === 'denied' || kind === 'not-found'
        ? { kind: 'refused', reason: 'no-such-session' }
        : { kind: 'unknown' }
    },
  }
}
