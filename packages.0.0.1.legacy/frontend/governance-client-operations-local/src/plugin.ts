import { type Context } from '@deepseek-ai/cordis'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import { GovernanceClientOperationsService } from '@omne-harness-lite/governance-client-operations/cordis'
import { CLIENT_LOCAL_STATE_SERVICE } from '@omne-harness-lite/client-local-state/cordis'
import { GOVERNANCE_TRANSPORT_SERVICE } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import { createGovernanceClient } from './client.ts'

export interface GovernanceClientConfig {
  readonly timeoutMs?: number
}
export class ClientService extends GovernanceClientOperationsService {
  constructor(
    ctx: Context,
    private readonly client: GovernanceClientOperations,
  ) {
    super(ctx)
  }
  runAction: GovernanceClientOperations['runAction'] = input => this.client.runAction(input)
  runPrepared: GovernanceClientOperations['runPrepared'] = (input, prompt) =>
    this.client.runPrepared(input, prompt)
  openUse: GovernanceClientOperations['openUse'] = () => this.client.openUse()
  close: GovernanceClientOperations['close'] = () => this.client.close()
}
export const governanceClientConfig = z
  .object({ timeoutMs: z.number().int().min(1).max(120_000).optional() })
  .strict()
  .transform(value => (value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }))
export const governanceClientOperationsPlugin = definePlugin<GovernanceClientConfig>({
  name: 'governance-client-operations-local',
  inject: [CLIENT_LOCAL_STATE_SERVICE, GOVERNANCE_TRANSPORT_SERVICE],
  Config: governanceClientConfig,
  async apply(ctx, config) {
    const client = createGovernanceClient({
      state: ctx.clientLocalState,
      transport: ctx.governanceTransport,
      ...config,
    })
    try {
      ctx.effect(() => () => client.close())
      new ClientService(ctx, client)
    } catch (error) {
      await client.close()
      throw error
    }
  },
})
