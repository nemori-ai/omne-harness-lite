import type { Context } from '@deepseek-ai/cordis'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  type ModelCallId,
  type ModelInvocationRef,
  type Revision,
} from '@omne-harness/model-contract'
import { compareRevisions } from '@omne-harness/model-contract/provider'
import { ModelRuntimeService, modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import type { Principal } from './values.ts'

export type Refresh = Readonly<{ tenant: TenantId; call: ModelCallId; revision: Revision }>

export type Followed = {
  readonly known: Map<ModelCallId, Revision>
  readonly refreshed: Refresh[]
  readonly stopped: ModelCallId[]
  started: number
  readonly received: unknown[]
}

export const newFollowed = (): Followed => ({
  known: new Map(),
  refreshed: [],
  stopped: [],
  started: 0,
  received: [],
})

export type FollowerConfig = Readonly<{
  principal: Principal
  tenant: TenantId
  tracked: readonly Readonly<{
    call: ModelCallId
    reference: ModelInvocationRef
    known: Revision
  }>[]
  followed: Followed
}>

export const followerPlugin = {
  name: 'call-follower',
  inject: [modelRuntimeKey],
  apply(ctx: Context, config: FollowerConfig) {
    const runtime: unknown = ctx.modelRuntime
    if (!(runtime instanceof ModelRuntimeService))
      throw new Error(`the service on ${modelRuntimeKey} is not the model runtime definition`)
    const { followed } = config
    const admissions = new Map<ModelCallId, ModelInvocationRef>()
    for (const item of config.tracked) {
      admissions.set(item.call, item.reference)
      followed.known.set(item.call, item.known)
    }
    followed.started += 1
    followed.received.push(runtime)

    ctx.on('model-cordis-contract/call-changed', async (tenant, call, notified) => {
      if (!tenantEquals(tenant, config.tenant)) return
      const reference = admissions.get(call)
      const known = followed.known.get(call)
      if (reference === undefined || known === undefined) return
      if (compareRevisions(notified, known) <= 0) return

      const found = await ctx.modelRuntime.calls.inspect({
        principal: config.principal,
        tenant: config.tenant,
        reference,
      })
      if ('failure' in found) {
        if (found.failure.kind !== 'denied')
          throw new Error(`the runtime could not show ${call}: ${found.failure.kind}`)
        admissions.delete(call)
        followed.known.delete(call)
        followed.stopped.push(call)
        return
      }
      if (found.ok.kind !== 'found') throw new Error(`the runtime holds no call ${call}`)
      const { revision } = found.ok.state
      if (compareRevisions(revision, known) <= 0) return
      followed.known.set(call, revision)
      followed.refreshed.push({ tenant, call, revision })
    })
  },
}
