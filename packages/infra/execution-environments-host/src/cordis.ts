import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { ExecutionEnvironmentsService, EXECUTION_ENVIRONMENTS, RESOURCE_RECOVERY_AUTHORITY } from '@omne-harness-lite/execution-environments/cordis'
import type { ExecutionEnvironmentOperations, EnvironmentProviderRegistrations } from '@omne-harness-lite/execution-environments'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { z } from 'zod'
import { createEnvironmentRegistry } from './registry.ts'
import { createHostEnvironment } from './host.ts'
class Registry extends ExecutionEnvironmentsService {
  constructor(ctx: Context, private readonly owner: ReturnType<typeof createEnvironmentRegistry>) { super(ctx) }
  describe(...args: Parameters<ExecutionEnvironmentOperations['describe']>) { return this.owner.operations.describe(...args) }
  acquire(...args: Parameters<ExecutionEnvironmentOperations['acquire']>) { return this.owner.operations.acquire(...args) }
  recover(...args: Parameters<EnvironmentProviderRegistrations['recover']>) { return this.owner.registrations.recover(...args) }
  registerProvider(...args: Parameters<EnvironmentProviderRegistrations['registerProvider']>) {
    const dispose = this.ctx.effect(() => this.owner.registrations.registerProvider(...args))
    return async () => { await dispose() }
  }
}
export const environmentRegistry = definePlugin({
  name: 'environment-registry', inject: [SESSION_ACCESS, RESOURCE_RECOVERY_AUTHORITY], Config: z.object({}).strict(),
  apply(ctx) {
    const owner = createEnvironmentRegistry({ access: ctx.sessionAccess, recovery: ctx.resourceRecoveryAuthority })
    ctx.effect(() => owner.close)
    new Registry(ctx, owner)
  },
})
export const hostEnvironment = definePlugin({
  name: 'host-environment', inject: [EXECUTION_ENVIRONMENTS, SESSION_ACCESS],
  Config: z.object({ provider: z.string().min(1) }).strict(),
  apply(ctx, config) {
    const provider = createHostEnvironment({ name: config.provider, access: ctx.sessionAccess })
    ctx.executionEnvironments.registerProvider(provider)
  },
})
