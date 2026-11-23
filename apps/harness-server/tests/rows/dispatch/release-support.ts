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
  textsOf,
  toolResults,
  type ReleaseTree,
  type ScriptedToolCall,
} from '../../support/release-tree.ts'

/** A call of Agents; a dispatch starts in the background, so it carries the intent its command requires. */
export const call = (id: string, command: string, params: Record<string, unknown> = {}) =>
  ({
    id,
    tool: 'Agents',
    arguments: JSON.stringify(
      command === 'dispatch' ? { command, intent: `dispatch ${id}`, params } : { command, params },
    ),
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
  return {
    entries,
    results: toolResults(entries).join('\n'),
    outcomes: outcomes(entries).join('\n'),
  }
}

/** What came back of the background calls of a session: the reminders that name a call, as their words read. */
export const outcomes = (entries: readonly { kind: string; payload: unknown }[]) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => textsOf(entry.payload).join('\n'))
    .filter(text => text.includes('This is background call'))

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
    asking: null,
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

/** The outcomes of a session once this many of its background calls came back, as reminders. */
export async function outcomesOf(tree: ReleaseTree, session: string, count: number) {
  const entries = await pollUntil(
    `${String(count)} background outcomes of ${session}`,
    () => historyOf(tree, session),
    value => outcomes(value).length >= count,
  )
  return outcomes(entries).join('\n')
}

type Settled = Awaited<ReturnType<typeof settled>>

/** The session once `done` holds of it and no run of it is going: wait for the fact itself, not for a count of runs. */
export async function settledWhen(
  tree: ReleaseTree,
  session: string,
  what: string,
  done: (seen: Settled) => boolean,
): Promise<Settled> {
  const seenOf = (entries: Awaited<ReturnType<typeof historyOf>>): Settled => ({
    entries,
    results: toolResults(entries).join('\n'),
    outcomes: outcomes(entries).join('\n'),
  })
  const quiet = (entries: Awaited<ReturnType<typeof historyOf>>) =>
    entries.filter(entry => entry.kind === 'run.started').length ===
    entries.filter(entry => entry.kind === 'run.terminal').length
  const entries = await pollUntil(
    `${what} in ${session}`,
    () => historyOf(tree, session),
    value => quiet(value) && done(seenOf(value)),
  )
  return seenOf(entries)
}

/** How many runs of the session have ended. */
export const runsEnded = async (tree: ReleaseTree, session: string) =>
  (await historyOf(tree, session)).filter(entry => entry.kind === 'run.terminal').length

/** A run ended after the entry that carries `text`: the turn that took it is over. */
export const endedAfter =
  (text: string) =>
  (seen: Settled): boolean => {
    const at = seen.entries.findIndex(entry => JSON.stringify(entry.payload).includes(text))
    return at >= 0 && seen.entries.slice(at).some(entry => entry.kind === 'run.terminal')
  }
