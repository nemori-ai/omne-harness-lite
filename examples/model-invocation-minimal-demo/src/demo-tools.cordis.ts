import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { TOOL_IMPLEMENTATIONS } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { z } from 'zod'
import { DEMO_TOOL_IMPLEMENTATIONS } from './demo-tools.ts'

export const demoPureTools = definePlugin({
  name: 'demo-pure-tools',
  inject: [TOOL_IMPLEMENTATIONS],
  Config: z.object({}).strict(),
  apply(ctx) {
    for (const implementation of DEMO_TOOL_IMPLEMENTATIONS)
      ctx.toolImplementations.register(implementation)
  },
})
