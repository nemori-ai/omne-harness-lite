import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  CLIENT_LOCAL_STATE_SERVICE,
  type ClientLocalState,
} from '@omne-harness-lite/client-local-state'
import { z } from 'zod'
import { createGovernanceClient } from './client.ts'
import { GOVERNANCE_CLIENT_OPERATIONS_SERVICE } from './surface.ts'

export const governanceClientOperationsPlugin = definePlugin<{ readonly timeoutMs?: number }>({
  name: 'governance-client-operations',
  inject: [CLIENT_LOCAL_STATE_SERVICE],
  Config: z
    .object({ timeoutMs: z.number().int().min(1).max(120_000).optional() })
    .strict()
    .transform(value => (value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs })),
  async apply(ctx, config) {
    const client = createGovernanceClient({
      state: ctx.get(CLIENT_LOCAL_STATE_SERVICE) as ClientLocalState,
      ...config,
    })
    try {
      ctx.effect(() => () => client.close())
      ctx.provide(GOVERNANCE_CLIENT_OPERATIONS_SERVICE, client)
    } catch (error) {
      await client.close()
      throw error
    }
  },
})
