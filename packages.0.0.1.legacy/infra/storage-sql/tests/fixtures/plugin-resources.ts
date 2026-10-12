import type { Context } from '@deepseek-ai/cordis'
import type { StorageStartupResources } from '@omne-harness-lite/storage'
import { StorageStartup } from '@omne-harness-lite/storage/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'

class TestStartup extends StorageStartup {
  readonly migrations: StorageStartupResources['migrations']
  readonly upgrade: StorageStartupResources['upgrade']
  constructor(ctx: Context, resources: StorageStartupResources) {
    super(ctx)
    this.migrations = resources.migrations
    this.upgrade = resources.upgrade
  }
}

export function startupPlugin(resources: StorageStartupResources) {
  return definePlugin({
    name: 'test-storage-startup',
    Config: z.object({}).strict(),
    apply(ctx: Context) {
      new TestStartup(ctx, resources)
    },
  })
}
