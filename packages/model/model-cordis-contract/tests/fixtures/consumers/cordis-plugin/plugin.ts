// The plugin under test. It depends on the runtime service through the key constant of the
// definition entry, refuses to run on a service that is not an instance of the definition class,
// listens to the call-changed notification through `ctx.on`, and asks the runtime for the
// authoritative revision before it believes the notification. It provides nothing.
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

/** What the plugin shows the assembly about its state; the plugin is the only writer. */
export type Followed = {
  /** The newest revision that the plugin has seen for each call it still follows. */
  readonly known: Map<ModelCallId, Revision>
  readonly refreshed: Refresh[]
  /** The calls that the plugin no longer follows because the runtime refused it. */
  readonly stopped: ModelCallId[]
  /** How many times the plugin ran. */
  started: number
  /** The runtime service that the plugin received through injection. */
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
  /** The principal that the assembly lets the plugin act for. */
  principal: Principal
  /** The only tenant whose notifications the plugin looks at. */
  tenant: TenantId
  tracked: readonly Readonly<{
    call: ModelCallId
    /** The operation under which the call was admitted, which finds the call again. */
    reference: ModelInvocationRef
    known: Revision
  }>[]
  followed: Followed
}>

export const followerPlugin = {
  name: 'call-follower',
  inject: [modelRuntimeKey],
  apply(ctx: Context, config: FollowerConfig) {
    // The key is all that the injection checks: whatever is provided on it is served here. The
    // runtime of the definition is an instance of the one class that the definition entry
    // exports; a class with the same members is not it, and this plugin does not run on one.
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

    // A failure of this listener reaches the sender of the notification, which records it and
    // keeps the committed change; the plugin does not catch it.
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
