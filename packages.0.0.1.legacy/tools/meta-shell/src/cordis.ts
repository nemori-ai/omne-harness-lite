import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { TOOL_IMPLEMENTATIONS } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { createShellTool } from './index.ts'

export const shell = definePlugin({
  name: 'meta-shell',
  inject: [TOOL_IMPLEMENTATIONS],
  Config: z
    .object({
      asset: z.string().min(1),
      version: z.string().min(1),
      shell: z.object({ executable: z.string().min(1), args: z.array(z.string()) }).strict(),
      maxOutputBytes: z.number().int().positive(),
      contextKey: z.string().min(1).optional(),
      backgroundThreshold: z.string().optional(),
      executePermission: z.enum(['forbid', 'auto', 'ask']).optional(),
    })
    .strict(),
  apply(ctx, config) {
    const tool = createShellTool({
      shell: config.shell,
      maxOutputBytes: config.maxOutputBytes,
      contextKey: config.contextKey ?? 'shell.initial',
      backgroundThreshold: config.backgroundThreshold ?? 'PT10M',
      executePermission: config.executePermission ?? 'ask',
    })
    ctx.effect(
      () =>
        ctx.toolImplementations.register({
          capability: capabilityCanonicalString({ category: 'tool', name: tool.definition.name }),
          asset: config.asset,
          version: config.version,
          ...tool,
        }),
      'meta-shell.registration',
    )
  },
})
