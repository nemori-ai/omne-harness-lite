import type { Context } from '@deepseek-ai/cordis'
import type { CallWaits } from '@omne-harness/dispatch-tool'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionId, SessionWorkPrincipals } from '@omne-harness/session-contract'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type {} from '@omne-harness/tool-cordis-contract/cordis'

const UNAVAILABLE = { kind: 'unavailable' } as const
const NO_CALL = { kind: 'read', value: null } as const

export type CallReadPorts = Readonly<{
  commands: () => Pick<Context['toolCommands'], 'loadRecovery'> | undefined
  work: () => SessionWorkPrincipals<unknown> | undefined
}>
type Made = Readonly<{ dispatcher: string; call: string }>

/** Reads the dispatching call as the dispatching session. Null: Tool has no such call for the tenant. */
export function createCallRead(ports: CallReadPorts) {
  return async (tenant: string, dispatch: Made): Promise<CallWaits> => {
    const legal = tenantCodec.parse(tenant)
    if (!legal.ok) return NO_CALL
    const commands = ports.commands()
    const work = ports.work()
    if (commands === undefined || work === undefined) return UNAVAILABLE
    const session = dispatch.dispatcher as SessionId
    const issued = await work.forSession({ actor: 'coordinator', tenant: legal.value, session })
    if ('failure' in issued) return issued.failure.kind === 'denied' ? NO_CALL : UNAVAILABLE
    const call = dispatch.call as ToolCallId
    const read = await commands.loadRecovery({ principal: issued.ok, tenant: legal.value, call })
    if ('failure' in read) {
      const { failure } = read
      const unknown = failure.kind === 'invalid' && failure.reason === 'unknown-call'
      return unknown ? NO_CALL : UNAVAILABLE
    }
    const { state, waits } = read.ok
    return { kind: 'read', value: { settled: state.phase === 'settled', waits } }
  }
}
