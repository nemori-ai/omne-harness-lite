import {
  AssemblyLifetimeService,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { type Context } from '@deepseek-ai/cordis'
import { AssemblyWorkStopped } from '@omne-harness-lite/assembly-lifecycle'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ClientLocalStateService,
  CLIENT_STATE_STORAGE_SERVICE,
} from '@omne-harness-lite/client-local-state/cordis'
import { z } from 'zod'
import {
  openClientLocalState,
  type ClientLocalStateInstance,
  type OpenClientLocalStateOptions,
} from './open.ts'

export class LocalStateService extends ClientLocalStateService {
  constructor(
    ctx: Context,
    private readonly state: ClientLocalStateInstance,
  ) {
    super(ctx)
  }
  read: ClientLocalStateService['read'] = () => this.state.read()
  compareAndReplace: ClientLocalStateService['compareAndReplace'] = (...args) =>
    this.state.compareAndReplace(...args)
}
export const clientLocalStateConfig = z.object({ directory: z.string() }).strict()
export const clientLocalStatePlugin = definePlugin<OpenClientLocalStateOptions>({
  name: 'client-local-state-sqlite',
  inject: [CLIENT_STATE_STORAGE_SERVICE],
  Config: clientLocalStateConfig,
  async apply(ctx, config) {
    const state = await openClientLocalState(config, { storage: ctx.clientStateStorage })
    try {
      ctx.effect(() => () => state.close())
      new LocalStateService(ctx, state)
    } catch (error) {
      await state.close()
      throw error
    }
  },
})

export const managedClientLocalStatePlugin = Object.assign(
  definePlugin<OpenClientLocalStateOptions>({
    name: 'client-local-state-sqlite-managed',
    inject: [CLIENT_STATE_STORAGE_SERVICE, AssemblyLifetimeService.provide],
    Config: clientLocalStateConfig,
    apply(ctx, config) {
      let resource: ClientLocalStateInstance | undefined
      startAssemblyWork(
        ctx,
        async () => {
          resource = await openClientLocalState(config, { storage: ctx.clientStateStorage })
          ctx.fiber.assertActive()
          if (!ctx.assemblyLifetime.isCurrent()) throw new AssemblyWorkStopped()
          new LocalStateService(ctx, resource)
        },
        async () => {
          await resource?.close()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const },
)
