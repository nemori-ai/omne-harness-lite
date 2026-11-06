// `tool-host` 行（AA 插件树、简报 B3-T2a 第 9 项）：tool-host-local 的换代协调者，发行内置作者来源。
// 与 `tool-residency` 成对装载。配置只有运维者层的构造值；发行层不写默认值（第 4 项）。
// B 段（R2-D79 第 4 条、R2-D169 候选 A）：行装好后，用发行登记者 `toolReleaseRegistrant` 作 access，对受信发行快照的
// 全部条目调用 `ensureLoaded`。首装不用 system 作用域；租户的采用点只读已装的作者。某一条不成功时在行日志
// （Cordis 记录器 `tool-host`）写一条 warn，写明作者名与失败种类，不放行：这个作者不进登记表，会话 create 的首装
// 与 Tool 调用都答 unavailable。行的就绪只表示换代协调者在服务，不表示作者已装（理由见行页）。
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
import { registrantOf, releaseOf } from '../../entry/tool-release.ts'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { releaseAuthorInput, type ReleaseAuthorOptions } from './release-author.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/** 发行作者的构造字段（L-TOOL 事实清单 §1）。值只来自运维者层，形状在边界上严格校验。 */
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
        TodoItems: z.strictObject({ resultMaxBytes: positive }).optional(),
        Tools: z
          .strictObject({
            resultMaxBytes: positive,
            outputModalities: z.tuple([z.literal('text')]),
          })
          .optional(),
        // `cwd` is the workspace root that relative Files paths resolve against (R2-D290). Optional:
        // without it, relative paths are refused and Files says that an absolute path is needed.
        Files: z
          .strictObject({ resultMaxBytes: positive, cwd: z.string().min(1).optional() })
          .optional(),
      })
      .optional(),
  })
  .default({})

const PRELOAD_LOGGER = 'tool-host'

type Preloaded = readonly Readonly<{ name: string; outcome: string }>[]
type PreloadHost = Pick<ToolGenerations<unknown, unknown, ToolMessageContentBlock>, 'ensureLoaded'>

/**
 * 按发行清单预装发行作者；失败只记 warn，原因是固定短语加失败种类，不含正文。读快照、登记者或记录器时抛出
 * 也在这里收住（行体用 `void` 调它，抛出不能成为未处理的 rejection），记一条 warn，答空。
 */
export async function preloadRelease(ctx: Context, host: PreloadHost): Promise<Preloaded> {
  try {
    return await preloadEntries(ctx, host)
  } catch {
    try {
      ctx.logger(PRELOAD_LOGGER).warn('release tools were not preloaded: the start load threw')
    } catch {
      // No logger to tell: the authors stay unloaded and every create or call answers unavailable.
    }
    return []
  }
}

async function preloadEntries(ctx: Context, host: PreloadHost): Promise<Preloaded> {
  const logger = ctx.logger(PRELOAD_LOGGER)
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') {
    logger.warn('release tools were not preloaded: the release snapshot is unavailable')
    return []
  }
  const registrant = registrantOf(ctx)
  if (registrant === undefined) {
    logger.warn('release tools were not preloaded: the release registrant is absent')
    return release.manifest.entries.map(entry => ({
      name: entry.asset.name,
      outcome: 'unavailable',
    }))
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
        access: registrant,
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
