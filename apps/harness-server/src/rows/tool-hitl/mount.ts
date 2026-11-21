import type { Context } from '@deepseek-ai/cordis'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import { fail } from '@omne-harness/operation-result'
import { toolCommandsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import { mountDecisionRoute } from '../tool-runtime/decision-routes.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { createToolHitlBridge, TOOL_HITL_OWNER } from './bridge.ts'
import { toolHitlHolder } from './holder.ts'
import { createToolHitlHost } from './host.ts'
import { currentInstanceHost, wakeOnDecision } from './wake.ts'

export function mountToolHitl(
  ctx: Context,
  options: Readonly<{
    storage: SqlStorage
    domains: TenantDomainLookup
    combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  }>,
): void {
  const tool = toolRuntimeHolder(ctx)
  const hitl = toolHitlHolder(ctx)
  const host = createToolHitlHost({
    ...options,
    verifier: () => tool.verifier(),
    standing: () => tool.standing(),
    reservations: () => hitl.reservations(),
    decided: wakeOnDecision(currentInstanceHost(ctx), text => ctx.logger('tool-hitl').warn(text)),
  })
  const readWork = sessionWorkReaderOf(ctx)
  const bridge = createToolHitlBridge({
    host: () => hitl.host,
    audience: () => hitl.audience,
    registrar: tenant => hitl.registrar(tenant),
    recoveryOf: async access => {
      const commands = ctx.get(toolCommandsKey)
      if (commands === undefined)
        return fail({
          kind: 'unavailable',
          dependency: TOOL_HITL_OWNER,
          diagnostic: 'tool commands are absent',
        })
      return commands.loadRecovery(access)
    },
    readWork: async ({ tenant, session }) => {
      const work = tool.workPrincipals()
      if (work === undefined) return undefined
      const issued = await work.forSession({ actor: 'coordinator', tenant, session })
      if ('failure' in issued) return issued
      return readWork({ principal: issued.ok, tenant, session })
    },
  })
  mountDecisionRoute(ctx, {
    contract: hitlDecisionWait.adoption,
    bridge: () => hitl.bridge ?? undefined,
  })
  hitl.host = host
  hitl.bridge = bridge
  hitl.decidedCards = bridge.decidedCards
  ctx.effect(
    () => () => {
      if (hitl.host === host) hitl.host = null
      if (hitl.bridge === bridge) hitl.bridge = null
      if (hitl.decidedCards === bridge.decidedCards) hitl.decidedCards = null
      void host.close()
    },
    'tool-records.hitl',
  )
}
