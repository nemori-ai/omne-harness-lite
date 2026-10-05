import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { SessionTenancyService } from '@omne-harness-lite/session-tenancy/cordis'
import { createSessionTenancyReader } from './reader.ts'

class Tenancy extends SessionTenancyService {
  constructor(
    ctx: Context,
    private readonly reader: ReturnType<typeof createSessionTenancyReader>,
  ) {
    super(ctx)
  }
  holdingTenant(session: unknown) {
    return this.reader.holdingTenant(session)
  }
}
export const sessionTenancyTablePlugin = definePlugin({
  name: 'session-tenancy-table',
  inject: [STORAGE_SERVICE],
  Config: z.object({}).strict(),
  apply(ctx) {
    const reader = createSessionTenancyReader(ctx.get(STORAGE_SERVICE) as Storage)
    ctx.effect(() => () => reader.close())
    new Tenancy(ctx, reader)
  },
})
