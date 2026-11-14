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
