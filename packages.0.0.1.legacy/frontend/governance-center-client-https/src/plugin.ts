import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { type Context } from '@deepseek-ai/cordis'
import { GovernanceTransportService } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import { createGovernanceTransport, type GovernanceTransportInstance } from './instance.ts'

export class TransportService extends GovernanceTransportService {
  constructor(
    ctx: Context,
    private readonly transport: GovernanceTransportInstance,
  ) {
    super(ctx)
  }
  readPublicHealth: GovernanceTransportService['readPublicHealth'] = options =>
    this.transport.readPublicHealth(options)
  exchangeGovernance: GovernanceTransportService['exchangeGovernance'] = (options, input) =>
    this.transport.exchangeGovernance(options, input)
}
export const transportConfig = z.object({}).strict()
export const governanceTransportPlugin = definePlugin<Record<string, never>>({
  name: 'governance-center-client-https',
  Config: transportConfig,
  async apply(ctx) {
    const transport = createGovernanceTransport()
    try {
      ctx.effect(() => () => transport.close())
      new TransportService(ctx, transport)
    } catch (error) {
      await transport.close()
      throw error
    }
  },
})

export const managedGovernanceTransportPlugin = Object.assign(
  definePlugin<Record<string, never>>({
    name: 'governance-center-client-https-managed',
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    Config: transportConfig,
    apply(ctx, config) {
      let resource: GovernanceTransportInstance | undefined
      startAssemblyWork(
        ctx,
        async () => {
          resource = createGovernanceTransport()
          new TransportService(ctx, resource)
        },
        async () => {
          await resource?.close()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const },
)
