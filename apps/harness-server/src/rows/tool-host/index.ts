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
        Ask: z.strictObject({ resultMaxBytes: positive }).optional(),
        Web: z.strictObject({ resultMaxBytes: positive, maxSearchResults: positive }).optional(),
        Tools: z
          .strictObject({
            resultMaxBytes: positive,
            outputModalities: z.tuple([z.literal('text')]),
          })
          .optional(),
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

export async function preloadRelease(ctx: Context, host: PreloadHost): Promise<Preloaded> {
  try {
    return await preloadEntries(ctx, host)
  } catch {
    try {
      ctx.logger(PRELOAD_LOGGER).warn('release tools were not preloaded: the start load threw')
    } catch {}
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
