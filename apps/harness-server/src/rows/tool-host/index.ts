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
import { ToolOperatorSettingsImpl, toolOperatorSettingsKey } from './operator-settings.ts'
import { setScriptSetting } from './script-host.ts'
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
            env: z.record(z.string(), z.string()),
          })
          .optional(),
        TodoItems: z.strictObject({ resultMaxBytes: positive }).optional(),
        BkgToolCalls: z.strictObject({ resultMaxBytes: positive }).optional(),
        Ask: z.strictObject({ resultMaxBytes: positive }).optional(),
        Web: z.strictObject({ resultMaxBytes: positive, maxSearchResults: positive }).optional(),
        Skills: z.strictObject({ resultMaxBytes: positive }).optional(),
        Calendar: z.strictObject({ resultMaxBytes: positive }).optional(),
        Schedules: z.strictObject({ resultMaxBytes: positive }).optional(),
        Jobs: z.strictObject({ resultMaxBytes: positive }).optional(),
        Notifications: z.strictObject({ resultMaxBytes: positive }).optional(),
        Canvas: z.strictObject({ resultMaxBytes: positive }).optional(),
        Sessions: z.strictObject({ resultMaxBytes: positive }).optional(),
        Agents: z.strictObject({ resultMaxBytes: positive }).optional(),
        Goal: z.strictObject({ resultMaxBytes: positive }).optional(),
        SwitchWorkspace: z.strictObject({ resultMaxBytes: positive }).optional(),
        OmneExtensions: z.strictObject({ resultMaxBytes: positive }).optional(),
        OmneExtensionPoints: z.strictObject({ resultMaxBytes: positive }).optional(),
        Tools: z
          .strictObject({
            resultMaxBytes: positive,
            outputModalities: z.tuple([z.literal('text')]),
          })
          .optional(),
        Files: z
          .strictObject({
            resultMaxBytes: positive,
            openMaxBytes: positive,
            imageMaxWidth: positive,
            imageMaxHeight: positive,
            imageMaxDecodedBytes: positive,
            imageConcurrency: positive,
          })
          .optional(),
        Screen: z
          .strictObject({
            resultMaxBytes: positive,
            captureMaxLongSide: positive,
            imageMaxWidth: positive,
            imageMaxHeight: positive,
            imageMaxDecodedBytes: positive,
            imageConcurrency: positive,
          })
          .optional(),
        Code: z
          .strictObject({
            resultMaxBytes: positive,
            computeMs: positive,
            memoryBytes: positive,
            outputBytes: positive,
            calls: positive,
            callsInFlight: positive,
            sourceBytes: positive,
          })
          .optional(),
      })
      .optional(),
    /** The operator's values for the settings a release tool declares, by tool name and item id. */
    settings: z.record(z.string(), z.record(z.string(), z.json())).optional(),
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
      const { construction, settings } = toolHostConfig.parse(config)
      new ToolOperatorSettingsImpl(ctx, settings ?? {})
      const shell = construction?.Shell
      if (shell !== undefined)
        setScriptSetting(ctx, { env: shell.env, resultMaxBytes: shell.resultMaxBytes })
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
    provides: [toolGenerationsKey, toolOperatorSettingsKey],
    injects: [toolBindingsKey, toolContributionAuthorityKey, toolResidencyReaderKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createToolHostPlugin({ preload: true }),
})
