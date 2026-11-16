import type { Context } from '@deepseek-ai/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { toolInstanceHostKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import type { ToolHitlHostInput } from './host.ts'

type Decided = NonNullable<ToolHitlHostInput['decided']>

export function wakeOnDecision(
  host: () => ToolInstanceHost<unknown> | undefined,
  warn: (text: string) => void = () => undefined,
): Decided {
  const missed = (step: string, why: string): void =>
    warn(`tool-hitl wake-up not done: ${step}: ${why}; the call waits for the next wake-up`)
  const reason = (error: unknown): string => (error instanceof Error ? error.message : 'unreadable')
  return ({ application, access, card }) => {
    void (async () => {
      let read: Awaited<ReturnType<typeof application.getRequest>>
      try {
        read = await application.getRequest(access, {
          protocol: 'hitl/1',
          requestRef: card.request,
        })
      } catch (error) {
        return missed('reading the request origin failed', reason(error))
      }
      if (read.kind !== 'found' || read.request.origin.kind !== 'tool') return
      const call = decodeToolCallId(
        read.request.origin.toolCallRef ?? read.request.origin.originRef,
      )
      if ('failure' in call) return
      const instance = host()
      if (instance === undefined) return missed('scheduling the call', 'no Tool instance host')
      try {
        await instance.schedule({ tenant: access.tenant, call: call.ok })
      } catch (error) {
        missed('scheduling the call failed', reason(error))
      }
    })().catch(() => undefined)
  }
}

export function currentInstanceHost(ctx: Context): () => ToolInstanceHost<unknown> | undefined {
  return () => ctx.get(toolInstanceHostKey, false) ?? undefined
}
