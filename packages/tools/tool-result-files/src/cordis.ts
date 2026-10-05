import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { RESOURCE_RECOVERY_AUTHORITY } from '@omne-harness-lite/execution-environments/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { TOOL_ACTION_HISTORY } from '@omne-harness-lite/tool-admission/cordis'
import {
  TOOL_IMPLEMENTATIONS,
  ToolResultsService,
} from '@omne-harness-lite/tool-execution-runtime/cordis'
import type { ToolResultStorageOperations } from '@omne-harness-lite/tool-execution-runtime'
import { isToolDefinition, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { z } from 'zod'
import { openToolResultStorage } from './provider.ts'

class Results extends ToolResultsService {
  constructor(
    ctx: Context,
    private readonly operations: ToolResultStorageOperations,
  ) {
    super(ctx)
  }
  readResult(...args: Parameters<ToolResultStorageOperations['readResult']>) {
    return this.operations.readResult(...args)
  }
  readBytes(...args: Parameters<ToolResultStorageOperations['readBytes']>) {
    return this.operations.readBytes(...args)
  }
  bindWriter(...args: Parameters<ToolResultStorageOperations['bindWriter']>) {
    return this.operations.bindWriter(...args)
  }
  available(...args: Parameters<ToolResultStorageOperations['available']>) {
    return this.operations.available(...args)
  }
  readForDelivery(...args: Parameters<ToolResultStorageOperations['readForDelivery']>) {
    return this.operations.readForDelivery(...args)
  }
  readDeliveryBytes(...args: Parameters<ToolResultStorageOperations['readDeliveryBytes']>) {
    return this.operations.readDeliveryBytes(...args)
  }
}
const selectedReader = z
  .object({
    capability: z.string().min(1),
    asset: z.string().min(1),
    version: z.string().min(1),
    adoption: z.string().min(1),
    definition: z.custom<ToolDefinition>(isToolDefinition),
  })
  .strict()

export const toolResultFiles = definePlugin({
  name: 'tool-result-files',
  inject: [
    SESSION_ACCESS,
    SESSION_LOG_BACKING,
    TOOL_ACTION_HISTORY,
    RESOURCE_RECOVERY_AUTHORITY,
    TOOL_IMPLEMENTATIONS,
  ],
  Config: z
    .object({
      directory: z.string().min(1),
      storage: z.string().min(1),
      reader: selectedReader.optional(),
    })
    .strict(),
  async apply(ctx, config) {
    const instance = await openToolResultStorage(
      { directory: config.directory, storage: config.storage },
      {
        authorization: ctx.sessionAccess,
        backing: ctx.sessionLogBacking,
        history: ctx.toolActionHistory,
        recoveryAuthority: ctx.resourceRecoveryAuthority,
        ...(config.reader
          ? { reader: { selected: config.reader, implementations: ctx.toolImplementations } }
          : {}),
      },
    )
    try {
      ctx.effect(() => () => instance.close(), 'tool-result-files.close')
      new Results(ctx, instance.operations)
    } catch (error) {
      await instance.close()
      throw error
    }
  },
})
