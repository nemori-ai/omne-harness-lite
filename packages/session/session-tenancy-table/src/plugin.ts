import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { createSessionTenancyReader } from './reader.ts'

export const SESSION_TENANCY_SERVICE = 'sessionTenancy' as const
export const sessionTenancyTablePlugin = definePlugin({
  name: 'session-tenancy-table',
  inject: ['storage'],
  Config: z.object({}).strict(),
  apply(ctx) {
    const reader = createSessionTenancyReader(ctx.get('storage') as Storage)
    ctx.effect(() => () => reader.close())
    ctx.provide(SESSION_TENANCY_SERVICE, Object.freeze({ holdingTenant: reader.holdingTenant }))
  },
})
