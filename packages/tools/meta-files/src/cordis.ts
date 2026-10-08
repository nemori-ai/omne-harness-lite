import sharp from 'sharp'
import { z } from 'zod'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { TOOL_IMPLEMENTATIONS } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { createFilesTool } from './index.ts'
const limit = z
  .number()
  .int()
  .positive()
  .max(Math.floor(Number.MAX_SAFE_INTEGER / 2))
export const files = definePlugin({
  name: 'meta-files',
  inject: [TOOL_IMPLEMENTATIONS],
  Config: z
    .object({
      asset: z.string().min(1),
      version: z.string().min(1),
      attachmentStorage: z.string().min(1),
      maxReadBytes: limit,
      maxWriteBytes: limit,
      maxImageBytes: limit,
      maxPageEntries: limit,
      maxPatchFiles: limit,
      maxEditsPerFile: limit,
      maxImagePixels: limit,
      maxImageDimension: limit,
      maxDiffChars: limit,
      diffTimeoutMs: limit,
      diffMaxEditLength: limit,
      contextKey: z.string().min(1).optional(),
      executePermission: z.enum(['forbid', 'auto', 'ask']).optional(),
    })
    .strict(),
  apply(ctx, config) {
    const tool = createFilesTool(
      {
        ...config,
        contextKey: config.contextKey ?? 'files.initial',
        executePermission: config.executePermission ?? 'ask',
      },
      { imageCodec: createSharpImageCodec(sharp) },
    )
    ctx.effect(
      () =>
        ctx.toolImplementations.register({
          capability: capabilityCanonicalString({ category: 'tool', name: tool.definition.name }),
          asset: config.asset,
          version: config.version,
          ...tool,
        }),
      'meta-files.registration',
    )
  },
})
