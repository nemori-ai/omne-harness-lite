import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { openClientLocalState, type OpenClientLocalStateOptions } from './open.ts'
import { CLIENT_LOCAL_STATE_SERVICE } from './surface.ts'

export const clientLocalStatePlugin = definePlugin<OpenClientLocalStateOptions>({
  name: 'client-local-state',
  Config: z.object({ directory: z.string() }).strict(),
  async apply(ctx, config) {
    const state = await openClientLocalState(config)
    try {
      ctx.effect(() => () => state.close())
      ctx.provide(CLIENT_LOCAL_STATE_SERVICE, state)
    } catch (error) {
      await state.close()
      throw error
    }
  },
})
