// 答复之后唤醒原调用（细化设计 v2 §3.3「唤醒」）：HITL 接受一次答复成为有效决定之后，决策方读这张卡的请求来源，
// 来源是 Tool 调用时，请 Tool 的实例宿主调度这个调用。唤醒只是提示：调用已受理以 Tool 的持久任务为准，丢了唤醒
// 不丢事实。驱动在下一次唤醒或重启后的待办扫描里读到同一批决定。
import type { Context } from '@deepseek-ai/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { toolInstanceHostKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import type { ToolHitlHostInput } from './host.ts'

type Decided = NonNullable<ToolHitlHostInput['decided']>

/**
 * 答复成立后的唤醒。`host` 逐次取当前的实例宿主。读来源与调度都在答复返回之后进行，失败不改变答复的结果，
 * 也不重试；没做成的那一步经 `warn` 说出来（缺省不说），原调用等下一次唤醒或重启后的待办扫描。
 */
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

/** 本次运行的 Tool 实例宿主。行还没有装好时答 undefined。 */
export function currentInstanceHost(ctx: Context): () => ToolInstanceHost<unknown> | undefined {
  return () => ctx.get(toolInstanceHostKey, false) ?? undefined
}
