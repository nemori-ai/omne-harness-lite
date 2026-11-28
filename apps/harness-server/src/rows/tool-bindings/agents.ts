import type { Context } from '@deepseek-ai/cordis'
import { askingMessageOf } from '@omne-harness/agent'
import { sessionRefSchema, tenantIdSchema } from '@omne-harness/dispatch-contract'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import {
  attachAgents,
  bindAgents,
  type SessionsAnswer,
  type SessionsFilter,
} from '@omne-harness/dispatch-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  RelationToReference,
  SessionId,
  SessionListFilter,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { agentDefinitionCatalogKey } from '../agent-adoptions/definition-catalog.ts'
import { turnOfSession } from '../tenant-assets/turn.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

function filterOf({ relation, attendance, definition }: SessionsFilter): SessionListFilter {
  return {
    ...(relation === null ? {} : { toReference: relation as RelationToReference }),
    ...(attendance === null ? {} : { attendance }),
    ...(definition === null ? {} : { definition }),
  }
}

/** The session that dispatches, reports or sends is the verified session of the call. The directory is
 * read as that session, through the reader caller class, with the session itself as the reference. */
export function bindReleaseAgents(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const reader = ctx.intercept(sessionKey, { caller: 'reader' })
  const access = { principal: parent.principal, tenant: parent.tenant }
  const caller = () =>
    domainCallerOf(toolRuntimeHolder(ctx).verifier(), parent.principal, parent.tenant)

  async function sessions(filter: SessionsFilter): Promise<SessionsAnswer> {
    const who = await caller()
    if (who === undefined) return { failure: 'denied' }
    const directory = reader.get(sessionKey, false)?.directory
    if (directory === undefined) return { failure: 'unavailable' }
    const asked = {
      principal: parent.principal,
      tenant: parent.tenant,
      after: filter.cursor,
      limit: filter.limit,
      reference: who.session as SessionId,
      filter: filterOf(filter),
    }
    const page = filter.archived
      ? await directory.listArchived({
          ...asked,
          from: null,
          to: null,
          by: null,
          titleContains: null,
        })
      : await directory.list(asked)
    if ('failure' in page) {
      const { kind } = page.failure
      return { failure: kind === 'denied' || kind === 'invalid' ? kind : 'unavailable' }
    }
    const items = page.ok.items.map(item => ({
      session: item.session,
      title: item.title,
      relation: item.toReference,
      attendance: item.attendance,
      definition: item.definition,
      lifecycle: item.lifecycle,
    }))
    return { ok: { items, next: page.ok.next, complete: page.ok.completeness === 'complete' } }
  }

  const agents = bindAgents({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    dispatching: () => ctx.get(dispatchingKey),
    async context() {
      const who = await caller()
      if (who === undefined) return undefined
      return {
        tenant: tenantIdSchema.parse(who.tenantId),
        subject: parent.principal,
        session: sessionRefSchema.parse(who.session),
        asking: askingMessageOf(parent.request.consumer),
      }
    },
    async targets() {
      const who = await caller()
      const turn =
        who === undefined
          ? undefined
          : await turnOfSession(ctx, { ...access, session: who.session as SessionId })
      if (turn === undefined) return undefined
      return ctx.get(agentDefinitionCatalogKey)?.visibleTo(parent.tenant, turn ?? undefined)
    },
    sessions: filter => sessions(filter).catch(() => ({ failure: 'unavailable' }) as const),
  })
  return holdLiveCall(ctx, parent, attachAgents(scope, agents))
}
