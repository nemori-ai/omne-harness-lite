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
 * 答复成立后的唤醒。`host` 逐次取当前的实例宿主；没有时不唤醒。读来源与调度都在答复返回之后进行，失败不报告给
 * 答复者，也不改变答复的结果。
 */
export function wakeOnDecision(host: () => ToolInstanceHost<unknown> | undefined): Decided {
  return ({ application, access, card }) => {
    void (async () => {
      const read = await application.getRequest(access, {
        protocol: 'hitl/1',
        requestRef: card.request,
      })
      if (read.kind !== 'found' || read.request.origin.kind !== 'tool') return
      const call = decodeToolCallId(
        read.request.origin.toolCallRef ?? read.request.origin.originRef,
      )
      if ('failure' in call) return
      await host()?.schedule({ tenant: access.tenant, call: call.ok })
    })().catch(() => undefined)
  }
}

/** 本次运行的 Tool 实例宿主。行还没有装好时答 undefined。 */
export function currentInstanceHost(ctx: Context): () => ToolInstanceHost<unknown> | undefined {
  return () => ctx.get(toolInstanceHostKey, false) ?? undefined
}
