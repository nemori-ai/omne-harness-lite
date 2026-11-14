import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelCalls, ModelRuntime, Revision } from '@omne-harness/model-contract'
import { ModelRuntimeService } from '@omne-harness/model-cordis-contract/cordis'
import { followerPlugin, newFollowed, type Followed, type FollowerConfig } from './plugin.ts'
import type { Principal } from './values.ts'

export type Follow = Pick<FollowerConfig, 'principal' | 'tenant' | 'tracked'>

export async function startAssembly(runtime: ModelRuntime<Principal>) {
  let inspections = 0
  const calls: ModelCalls<Principal> = {
    admit: input => runtime.calls.admit(input),
    inspect(input) {
      inspections += 1
      return runtime.calls.inspect(input)
    },
    dispatches: input => runtime.calls.dispatches(input),
    cancel: input => runtime.calls.cancel(input),
    contact: input => runtime.calls.contact(input),
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
    Hosted: HostedRuntime,
    inspections: (): number => inspections,
    diagnostics: (): readonly string[] => diagnostics,
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
