import type { CallContext, DispatchId, SessionRef } from '@omne-harness/dispatch-contract'
import { tenantIdSchema } from '@omne-harness/dispatch-contract'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import { noArguments } from '@omne-harness/authorization'
import { tenantCodec } from '@omne-harness/legal-identity'
import { dispatchPrincipalOf } from '../../../src/entry/principals.ts'
import { systemActionAuthorizationKey } from '../../../src/rows/authorization/system-action-service.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import {
  historyOf,
  pollUntil,
  toolResults,
  type ReleaseTree,
  type ScriptedToolCall,
} from '../../support/release-tree.ts'

export const call = (id: string, command: string, params: Record<string, unknown> = {}) =>
  ({
    id,
    tool: 'Agents',
    arguments: JSON.stringify({ command, params }),
  }) satisfies ScriptedToolCall

/** The starting input of a dispatched session carries this sentence; a request with it is the dispatched agent's. */
export const DISPATCHED = 'Another agent dispatched one piece of work to you'
export const answered = (body: string) => body.includes('"role":"tool"')
export const dispatchIn = (text: string) =>
  /dsp_[0-9a-f]{64}/u.exec(text)?.[0] as DispatchId | undefined

/** The history of a session once it has ended this many runs, and the results of its tool calls. */
export async function settled(tree: ReleaseTree, session: string, runs = 1) {
  const entries = await pollUntil(
    `the Run ${String(runs)} of ${session} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return { entries, results: toolResults(entries).join('\n') }
}

export const reminders = (entries: readonly { kind: string; payload: unknown }[]) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => JSON.stringify(entry.payload))

/** The dispatch service as the session of a call reaches it: the context a tool binding would give. */
export async function registryAs(tree: ReleaseTree, session: string) {
  const { tenant } = tree.registrar()
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('the tenant has no text')
  const issued = await toolRuntimeHolder(tree.scope)
    .workPrincipals()
    ?.forSession({ actor: 'coordinator', tenant, session: session as never })
  if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
  const dispatching = tree.scope.get(dispatchingKey)
  if (dispatching === undefined) throw new Error('no dispatching service')
  const ctx: CallContext = {
    tenant: tenantIdSchema.parse(text.value),
    subject: issued.ok,
    session: session as unknown as SessionRef,
  }
  const shown = async (id: DispatchId) => {
    const answer = await dispatching.show(ctx, id)
    if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
    return answer.value
  }
  return {
    ctx,
    dispatching,
    shown,
    /** The dispatches this session made, as the registry lists them. */
    async made() {
      const answer = await dispatching.list(ctx, { by: { dispatcher: ctx.session } })
      return answer.kind === 'done' ? answer.value : []
    },
    delivered: (id: DispatchId) =>
      pollUntil(
        `the delivery of ${id}`,
        () => shown(id),
        dispatch => dispatch.delivery !== null && dispatch.delivery.kind !== 'pending',
      ),
  }
}

/** Whether the system principal of dispatch may read the fate of an input of a session now: its grant at work. */
export async function dispatchGrantAnswer(tree: ReleaseTree, session: string) {
  const trusted = tree.env.readTrusted(systemActionAuthorizationKey)
  const checks = trusted.get(systemActionAuthorizationKey)
  if (checks === undefined) throw new Error('no system action authorization')
  return checks.check({
    principal: dispatchPrincipalOf(tree.env),
    scope: 'system',
    operation: { owner: 'session', name: 'readInputFate' },
    arguments: noArguments(),
    target: {
      kind: 'tenant',
      tenant: tree.registrar().tenant,
      resource: { owner: 'session', kind: 'session', key: session },
    },
  })
}
