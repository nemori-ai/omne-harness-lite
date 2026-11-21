import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, Reply, ToolFailure, ToolWaitId } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolDecisionBridge,
  ToolRecovery,
} from '@omne-harness/tool-contract/provider'

type Facts = Pick<ToolRecovery, 'waits' | 'tasks'>
type Find = (facts: Facts) => ToolWaitId | undefined

/** One request contract of a decision wait, and the bridge of its owner as it is mounted now. */
export type ToolDecisionRoute<P> = Readonly<{
  contract: Pick<Adoption, 'owner' | 'name'>
  bridge: () => ToolDecisionBridge<P> | undefined
}>

export type ToolDecisionRoutesInput<P> = Readonly<{
  recoveryOf: (access: CallAccess<P>) => Reply<Facts>
  routes: () => readonly ToolDecisionRoute<P>[]
}>

const NO_WAIT: Outcome<never, ToolFailure> = fail({
  kind: 'invalid',
  field: 'wait',
  reason: 'the call has no such wait for a decision',
})

/** Finds the bridge of a wait by the name of its request contract. It does not read a request or an answer. */
export function routeToolDecisions<P>(input: ToolDecisionRoutesInput<P>): ToolDecisionBridge<P> {
  const bridgeOf = async (
    { principal, tenant, call }: CallAccess<P>,
    find: Find,
  ): Promise<Outcome<ToolDecisionBridge<P>, ToolFailure>> => {
    const facts = await input.recoveryOf({ principal, tenant, call })
    if ('failure' in facts) return facts
    const wait = find(facts.ok)
    const intent = facts.ok.waits.find(record => record.intent.wait === wait)?.intent
    if (intent?.kind !== 'ask') return NO_WAIT
    const { owner, name } = intent.schemas.contract
    const route = input
      .routes()
      .find(item => item.contract.owner === owner && item.contract.name === name)
    const bridge = route?.bridge()
    if (bridge !== undefined) return succeed(bridge)
    return fail({
      kind: 'unavailable',
      dependency: 'tool-decisions',
      diagnostic: `no decision bridge is mounted for the wait contract ${owner}/${name}`,
    })
  }

  const ofWait =
    <I extends CallAccess<P> & Readonly<{ wait: ToolWaitId }>, T>(
      step: (bridge: ToolDecisionBridge<P>, request: I) => Reply<T>,
    ) =>
    async (request: I): Promise<Outcome<T, ToolFailure>> => {
      const found = await bridgeOf(request, () => request.wait)
      return 'failure' in found ? found : step(found.ok, request)
    }

  return {
    ensure: ofWait((bridge, request) => bridge.ensure(request)),
    inspect: ofWait((bridge, request) => bridge.inspect(request)),
    invalidate: ofWait((bridge, request) => bridge.invalidate(request)),
    resolve: ofWait((bridge, request) => bridge.resolve(request)),
    inspectOperation: async request => {
      const { operation } = request
      const found = await bridgeOf(request, facts => {
        const duty = facts.tasks.find(
          task => task.kind === 'wait-registration' && task.operation === operation,
        )
        return duty?.kind === 'wait-registration' ? duty.wait : undefined
      })
      if ('ok' in found) return found.ok.inspectOperation(request)
      const diagnostic = `the bridge of the operation is not found: ${found.failure.kind}`
      return succeed({ kind: 'unknown', operation, diagnostic })
    },
  }
}
