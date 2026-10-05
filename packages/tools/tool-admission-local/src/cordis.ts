import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { LOOP_EXTENSION_IMPLEMENTATIONS } from '@omne-harness-lite/loop-extension-runner/cordis'
import { SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import {
  ToolAdmissionService,
  TOOL_ADMISSION,
  TOOL_ADMISSION_PASS_SOURCE,
  TOOL_ACTION_HISTORY,
} from '@omne-harness-lite/tool-admission/cordis'
import { z } from 'zod'
import { createToolAdmission } from './provider.ts'

class Admission extends ToolAdmissionService {
  constructor(
    ctx: Context,
    private readonly operations: ToolAdmissionOperations,
  ) {
    super(ctx)
  }
  forPass(...args: Parameters<ToolAdmissionOperations['forPass']>) {
    return this.operations.forPass(...args)
  }
  verifyToken(...args: Parameters<ToolAdmissionOperations['verifyToken']>) {
    return this.operations.verifyToken(...args)
  }
}
export const toolAdmissionLocal = definePlugin({
  name: 'tool-admission-local',
  inject: [SESSION_ACCESS, SESSION_LOG_BACKING, TOOL_ADMISSION_PASS_SOURCE, TOOL_ACTION_HISTORY],
  Config: z.object({}).strict(),
  apply(ctx) {
    const instance = createToolAdmission({
      access: ctx.sessionAccess,
      backing: ctx.sessionLogBacking,
      source: ctx.toolAdmissionPassSource,
      history: ctx.toolActionHistory,
    })
    ctx.effect(() => () => instance.close(), 'tool-admission-local.close')
    new Admission(ctx, instance)
  },
})
export const officialAdmission = definePlugin({
  name: 'official-tool-admission',
  inject: [LOOP_EXTENSION_IMPLEMENTATIONS, TOOL_ADMISSION],
  Config: z.object({}).strict(),
  apply(ctx) {
    const admission = ctx.toolAdmission
    // The registry service owns withdrawal in this contributor's fiber.
    ctx.loopExtensionImplementations.registerAdmission(async (access, scope, pass, batch) => {
      const bound = await admission.forPass(access, scope, pass)
      if (bound.kind !== 'bound')
        return {
          kind: 'failed',
          reason: bound.reason === 'invalidInput' ? 'invalidInput' : 'unavailable',
        }
      return bound.judgment.admit(batch)
    })
  },
})
