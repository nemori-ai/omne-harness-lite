import type { Context } from '@deepseek-ai/cordis'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import {
  dispatchReconcilingKey,
  dispatchingKey,
} from '@omne-harness/dispatch-cordis-contract/cordis'
import {
  createReportBridge,
  createReportWaits,
  dispatchReportWait,
  type CallWaits,
} from '@omne-harness/dispatch-tool'
import { tenantIdSchema } from '@omne-harness/dispatch-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import type { ToolCallId } from '@omne-harness/tool-contract'
import { toolCommandsKey, toolInstanceHostKey } from '@omne-harness/tool-cordis-contract/cordis'
import { DISPATCH_PRINCIPAL_KEY } from '../../entry/dispatch-principal.ts'
import { defineRow } from '../../row.ts'
import { dispatchHolder } from '../dispatch/holder.ts'
import { mountDecisionRoute } from '../tool-runtime/decision-routes.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'

const OWNER = 'harness-server/dispatch-tool'
const UNAVAILABLE = { kind: 'unavailable' } as const
/** The registry is read as the system principal: no session is named. */
const NO_SESSION = 'system' as SessionRef

function bridgeOf(ctx: Context, system: unknown) {
  const textOf = (tenant: TenantId) => {
    const encoded = tenantCodec.encode(tenant)
    return encoded.ok ? tenantIdSchema.parse(encoded.value) : undefined
  }
  return createReportBridge({
    recoveryOf: async access =>
      ctx.get(toolCommandsKey)?.loadRecovery(access) ??
      fail({ kind: 'unavailable', dependency: OWNER, diagnostic: 'tool commands are absent' }),
    async dispatchOf(tenant, id) {
      const text = textOf(tenant)
      const dispatching = ctx.get(dispatchingKey)
      if (text === undefined || dispatching === undefined) return UNAVAILABLE
      const shown = await dispatching.show(
        { tenant: text, subject: system, session: NO_SESSION },
        id,
      )
      if (shown.kind === 'done') return { kind: 'read', value: shown.value }
      return shown.kind === 'refused' && shown.reason === 'no-such-dispatch'
        ? { kind: 'read', value: null }
        : UNAVAILABLE
    },
    waitClosed(tenant, id) {
      const text = textOf(tenant)
      if (text !== undefined)
        void ctx
          .get(dispatchReconcilingKey)
          ?.advance(text, id)
          .catch(() => undefined)
    },
  })
}

function waitsOf(ctx: Context) {
  const legalOf = (tenant: string) => {
    const parsed = tenantCodec.parse(tenant)
    return parsed.ok ? parsed.value : undefined
  }
  return createReportWaits({
    async callOf(tenant, dispatch): Promise<CallWaits> {
      const legal = legalOf(tenant)
      const commands = ctx.get(toolCommandsKey)
      const work = toolRuntimeHolder(ctx).workPrincipals()
      if (legal === undefined) return { kind: 'read', value: null }
      if (commands === undefined || work === undefined) return UNAVAILABLE
      const session = dispatch.dispatcher as unknown as SessionId
      const issued = await work.forSession({ actor: 'coordinator', tenant: legal, session })
      if ('failure' in issued)
        return issued.failure.kind === 'denied' ? { kind: 'read', value: null } : UNAVAILABLE
      const call = dispatch.call as ToolCallId
      const read = await commands.loadRecovery({ principal: issued.ok, tenant: legal, call })
      if ('failure' in read) {
        const { failure } = read
        const unknown = failure.kind === 'invalid' && failure.reason === 'unknown-call'
        return unknown ? { kind: 'read', value: null } : UNAVAILABLE
      }
      const { state, waits } = read.ok
      return { kind: 'read', value: { settled: state.phase === 'settled', waits } }
    },
    async schedule(tenant, dispatch) {
      const legal = legalOf(tenant)
      if (legal === undefined) return undefined
      return ctx
        .get(toolInstanceHostKey)
        ?.schedule({ tenant: legal, call: dispatch.call as ToolCallId })
    },
  })
}

/** Dispatch's side that knows Tool: the bridge of the report wait, and the read of whether a wait took an outcome. */
export const dispatchToolRow = defineRow({
  row: 'dispatch-tool',
  implementation: 'real',
  manifest: { provides: [], injects: [DISPATCH_PRINCIPAL_KEY], sameProviderGroup: null },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    const holder = dispatchHolder(ctx)
    const bridge = bridgeOf(ctx, ctx.get(DISPATCH_PRINCIPAL_KEY) as unknown)
    const waits = waitsOf(ctx)
    mountDecisionRoute(ctx, { contract: dispatchReportWait.adoption, bridge: () => bridge })
    holder.waits = waits
    return {
      async stop() {
        if (holder.waits === waits) holder.waits = null
        return { kind: 'settled' }
      },
    }
  },
})
