// `tool-host` 行（AA 插件树、简报 B3-T2a 第 9 项）：tool-host-local 的换代协调者，发行内置作者来源。
// 与 `tool-residency` 成对装载。配置只有运维者层的构造值；发行层不写默认值（第 4 项）。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  toolBindingsKey,
  toolContributionAuthorityKey,
  toolGenerationsKey,
  toolResidencyReaderKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolHostPlugin } from '@omne-harness/tool-host-local/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { releaseAuthorInput, type ReleaseAuthorOptions } from './release-author.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/** 两个作者的构造字段（L-TOOL 事实清单 §1）。值只来自运维者层，形状在边界上严格校验。 */
export const toolHostConfig = z
  .strictObject({
    construction: z
      .strictObject({
        Shell: z
          .strictObject({
            resultMaxBytes: positive,
            executable: z.string().min(1),
            argsPrefix: z.array(z.string()),
            cwd: z.string().min(1),
            env: z.record(z.string(), z.string()),
          })
          .optional(),
        Files: z.strictObject({ resultMaxBytes: positive }).optional(),
      })
      .optional(),
  })
  .default({})

/** 建行插件。`options` 只在测试里给。 */
export function createToolHostPlugin(options: ReleaseAuthorOptions = {}): Plugin.Object {
  return {
    name: 'tool-host',
    inject: [toolBindingsKey, toolContributionAuthorityKey, toolResidencyReaderKey],
    Config: toolHostConfig,
    apply(ctx: Context, config: unknown) {
      const { construction } = toolHostConfig.parse(config)
      const Host = createLocalToolHostPlugin<unknown, unknown, ToolMessageContentBlock>(
        releaseAuthorInput(ctx, construction ?? {}, options),
      )
      // The service registers itself in this row's fiber (Cordis `Service` constructor).
      new Host(ctx)
    },
  }
}

export const toolHostRow = defineRow({
  row: 'tool-host',
  implementation: 'real',
  manifest: {
    provides: [toolGenerationsKey],
    injects: [toolBindingsKey, toolContributionAuthorityKey, toolResidencyReaderKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createToolHostPlugin(),
})
