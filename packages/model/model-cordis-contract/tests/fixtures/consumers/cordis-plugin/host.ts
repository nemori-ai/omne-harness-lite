// The assembly side of the fixture. It stands for the party that picks the provider and sends the
// notification: one host plugin provides a scripted runtime on the `modelRuntime` key through a
// class that extends the definition, and `announce` sends the call-changed notification the way a
// provider does, catching what the listeners throw. It is not a provider and decides nothing for the
// plugin under test.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelCalls, ModelRuntime, Revision } from '@omne-harness/model-contract'
import { ModelRuntimeService } from '@omne-harness/model-cordis-contract/cordis'
import { followerPlugin, newFollowed, type Followed, type FollowerConfig } from './plugin.ts'
import type { Principal } from './values.ts'

export type Follow = Pick<FollowerConfig, 'principal' | 'tenant' | 'tracked'>

export async function startAssembly(runtime: ModelRuntime<Principal>) {
  let inspections = 0
  // Counting is all that this wrapper adds: every answer is the runtime's own.
  const calls: ModelCalls<Principal> = {
    admit: input => runtime.calls.admit(input),
    inspect(input) {
      inspections += 1
      return runtime.calls.inspect(input)
    },
    dispatches: input => runtime.calls.dispatches(input),
    cancel: input => runtime.calls.cancel(input),
  }
  class HostedRuntime extends ModelRuntimeService<Principal> {
    readonly calls = calls
    readonly consumption = runtime.consumption
    readonly instances = runtime.instances
  }

  const root = new Context()
  const fibers: Fiber[] = []
  const diagnostics: string[] = []
  const host = root.plugin({
    name: 'runtime-host',
    apply(ctx: Context) {
      new HostedRuntime(ctx)
    },
  })
  fibers.push(host)
  await host

  return {
    root,
    /** The class whose instance the host provides. */
    Hosted: HostedRuntime,
    /** How many times the plugin asked the runtime to show a call. */
    inspections: (): number => inspections,
    /** What the listeners threw, as the sender of the notification recorded it. */
    diagnostics: (): readonly string[] => diagnostics,
    /** Loads the plugin under test and waits until its injection is served. */
    async follow(follow: Follow): Promise<{ fiber: Fiber; followed: Followed }> {
      const followed = newFollowed()
      const fiber = root.plugin(followerPlugin, { ...follow, followed })
      fibers.push(fiber)
      await fiber
      return { fiber, followed }
    },
    async announce(tenant: TenantId, call: ModelCallId, revision: Revision): Promise<void> {
      try {
        await root.parallel('model-cordis-contract/call-changed', tenant, call, revision)
      } catch (error) {
        if (!(error instanceof AggregateError)) throw error
        for (const reason of error.errors)
          diagnostics.push(reason instanceof Error ? reason.message : String(reason))
      }
    },
    async close(): Promise<void> {
      await Promise.all(fibers.map(fiber => fiber.dispose()))
    },
  }
}

export type Assembly = Awaited<ReturnType<typeof startAssembly>>
