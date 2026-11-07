import type { Context, Plugin } from '@deepseek-ai/cordis'
import { decodeAgentToolDeliveryMaterial } from '@omne-harness/agent'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import {
  createSessionToolLogConsumptionPlugin,
  type SessionToolLogConsumptionConfig,
  type ToolLogTarget,
} from '@omne-harness/session-adapters/cordis'
import {
  sessionKey,
  sessionTransactionsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

type Consume = ReturnType<typeof createSessionToolLogConsumptionPlugin>['consume']
const current = new WeakMap<Context, Consume>()

export function consumeSessionToolLog(ctx: Context, target: ToolLogTarget): ReturnType<Consume> {
  const consume = current.get(ctx.root)
  return consume === undefined
    ? Promise.resolve(
        fail({
          kind: 'unavailable',
          owner: 'session-ad06',
          diagnostic: 'no active consumption row',
        }),
      )
    : consume(target)
}

const INJECTS = [
  sessionWorkPrincipalsKey,
  sessionKey,
  agentJournalKey,
  agentJournalEntriesKey,
  agentMaterialsKey,
  sessionTransactionsKey,
]

const plugin: Plugin.Object<SessionToolLogConsumptionConfig | undefined> = {
  name: 'session-ad06',
  inject: INJECTS,
  async apply(ctx: Context, config) {
    const consumption = createSessionToolLogConsumptionPlugin({
      toolDeliveries: decodeAgentToolDeliveryMaterial,
      coordinator: coordinatorPrincipalsOf(ctx),
    })
    ctx.effect(() => {
      current.set(ctx.root, consumption.consume)
      return () => {
        if (current.get(ctx.root) === consumption.consume) current.delete(ctx.root)
      }
    })
    await ctx.plugin(consumption.plugin, config)
  },
}

export const sessionAd06Row = defineRow({
  row: 'session-ad06',
  implementation: 'real',
  manifest: { provides: [], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
