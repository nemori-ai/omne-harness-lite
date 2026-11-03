// `tool-host` 行（AA 插件树、简报 B3-T2a 第 9 项）：tool-host-local 的换代协调者，发行内置作者来源。
// 与 `tool-residency` 成对装载。配置只有运维者层的构造值；发行层不写默认值（第 4 项）。
// B 段（R2-D79 第 4 条）：行装好后按发行清单预装 Shell 与 Files（系统作用域的 `ensureLoaded`，作者闭包的登记者是
// `toolReleaseRegistrant`）。租户的采用点只读已装的作者，不用租户 access 首装官方作者。预装不成功只记 warn
// （例如运维者层缺构造值、快照不可用），不放行：Catalog 里没有这个作者，调用答不可用。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  toolBindingsKey,
  toolContributionAuthorityKey,
  toolGenerationsKey,
  toolResidencyReaderKey,
  type ToolGenerations,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolHostPlugin } from '@omne-harness/tool-host-local/cordis'
import { releaseOf } from '../../entry/tool-release.ts'
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

const PRELOAD_LOGGER = 'tool-host'

/** 按发行清单预装两个作者；失败只记 warn，原因是固定短语加失败种类，不含正文。 */
export async function preloadRelease(
  ctx: Context,
  host: Pick<ToolGenerations<unknown, unknown, ToolMessageContentBlock>, 'ensureLoaded'>,
): Promise<readonly Readonly<{ name: string; outcome: string }>[]> {
  const release = releaseOf(ctx)
  const logger = ctx.logger(PRELOAD_LOGGER)
  if (release.kind !== 'trusted') {
    logger.warn('release tools were not preloaded: the release snapshot is unavailable')
    return []
  }
  const results: Readonly<{ name: string; outcome: string }>[] = []
  for (const entry of release.manifest.entries) {
    let outcome: string
    try {
      const loaded = await host.ensureLoaded({
        authority: {
          layer: { kind: 'official' },
          asset: entry.asset,
          holding: entry.holding,
          publication: entry.publication,
        },
        access: { scope: 'system' },
      })
      outcome = 'ok' in loaded ? 'loaded' : loaded.failure.kind
    } catch {
      outcome = 'threw'
    }
    if (outcome !== 'loaded')
      logger.warn('release tool %s was not preloaded: %s', entry.asset.name, outcome)
    results.push({ name: entry.asset.name, outcome })
  }
  return results
}

/**
 * 建行插件。`options` 只在测试里给；`preload` 为 true 时行装好后预装发行作者（发行行是这样建的，测试按需打开）。
 */
export function createToolHostPlugin(
  options: ReleaseAuthorOptions & Readonly<{ preload?: boolean }> = {},
): Plugin.Object {
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
      const host = new Host(ctx)
      // After this body returns, so the author plugins load under a live coordinator.
      if (options.preload === true) setImmediate(() => void preloadRelease(ctx, host))
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
  plugin: createToolHostPlugin({ preload: true }),
})
