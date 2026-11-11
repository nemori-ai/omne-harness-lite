// Row id `agent-cards`: Agent 的卡片端口（`agentDecisionCards`）在本发行的提供者。它把 Agent 循环要人决定时的
// 一轮卡片经 HITL 保管：与 Tool 的 Ask 等待共用同一个 HITL 宿主、守卫、受众与登记主体（`rows/tool-hitl` 的
// holder，按根取，由 `tool-records` 行与入口对象 `toolClock` 填入）。映射与调用见 `cards.ts`、`provider.ts`。
//
// - 提供：`agentDecisionCards`。Agent 宿主每次调用经 `ctx.get` 现取（阶段端口），本行缺席时宿主答 unavailable。
// - 注入：`session`，以调用方类 `coordinator` 读会话快照，取调用方执行所在的 Run。
// - holder 上的宿主、受众或登记主体还没有填入时，各操作答 unavailable，不猜。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { DecisionCards } from '@omne-harness/agent-contract'
import {
  DecisionCardsService,
  agentDecisionCardsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'
import { createAgentDecisionCards } from './provider.ts'

// The service keeps closures only: no `#` private field, because a method reached through a caller
// proxy has a `this` that is not the instance (docs/real-mode.md).
class DecisionCardsImpl extends DecisionCardsService<unknown> {
  readonly present: DecisionCards<unknown>['present']
  readonly lookup: DecisionCards<unknown>['lookup']
  readonly read: DecisionCards<unknown>['read']
  readonly invalidate: DecisionCards<unknown>['invalidate']
  constructor(ctx: Context, delegate: DecisionCards<unknown>) {
    super(ctx)
    this.present = input => delegate.present(input)
    this.lookup = input => delegate.lookup(input)
    this.read = input => delegate.read(input)
    this.invalidate = input => delegate.invalidate(input)
  }
}

const plugin: Plugin.Object = {
  name: 'agent-cards',
  inject: [sessionKey],
  apply(ctx: Context) {
    const hitl = toolHitlHolder(ctx)
    const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
    new DecisionCardsImpl(
      ctx,
      createAgentDecisionCards({
        host: () => hitl.host,
        audience: () => hitl.audience,
        registrar: tenant => hitl.registrar(tenant),
        readWork: async access => coordinator.get(sessionKey)?.work.readWork(access),
      }),
    )
  },
}

export const agentCardsRow = defineRow({
  row: 'agent-cards',
  implementation: 'real',
  manifest: {
    provides: [agentDecisionCardsKey],
    injects: [sessionKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
